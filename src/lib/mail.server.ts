/**
 * Server-only Gmail helpers for the SyllabusStudy Email page.
 * All provider calls run through the connector gateway on behalf of the
 * signed-in student, using their own encrypted connection key.
 */
import {
  appUserReconnectRequired,
  callAsAppUser,
} from "@/integrations/lovable/appUserConnector";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GMAIL_CONNECTOR = "google_mail";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
];

export class ReconnectNeeded extends Error {
  constructor() {
    super("reconnect_required");
  }
}

export interface MailHeaderRow {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
}

export interface MailBody extends MailHeaderRow {
  bodyText: string;
  bodyHtml: string;
  attachments: { filename: string; mimeType: string; size: number }[];
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
};

async function gmail(
  connectionAPIKey: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: GMAIL_CONNECTOR,
    path,
    requiredScopes: GMAIL_SCOPES,
    ...(init ? { init } : {}),
  });
  if (await appUserReconnectRequired(res)) throw new ReconnectNeeded();
  const text = await res.text();
  if (!res.ok) {
    console.error(`Gmail request failed [${res.status}] ${path}: ${text.slice(0, 500)}`);
    throw new Error("We couldn't reach your inbox just now. Please try again.");
  }
  return text ? JSON.parse(text) : {};
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  const found = headers?.find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

function splitAddress(raw: string) {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { fromName: (match[1] ?? "").trim() || (match[2] ?? ""), fromEmail: (match[2] ?? "").trim() };
  }
  const trimmed = raw.trim();
  return { fromName: trimmed, fromEmail: trimmed };
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = Buffer.from(normalized, "base64");
  return bin.toString("utf8");
}

function flattenParts(part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!part) return out;
  out.push(part);
  for (const child of part.parts ?? []) flattenParts(child, out);
  return out;
}

function toRow(msg: GmailMessage): MailHeaderRow {
  const headers = msg.payload?.headers;
  const from = header(headers, "From");
  const { fromName, fromEmail } = splitAddress(from);
  const labels = msg.labelIds ?? [];
  const parts = flattenParts(msg.payload);
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    from,
    fromName,
    fromEmail,
    to: header(headers, "To"),
    subject: header(headers, "Subject") || "(no subject)",
    date: header(headers, "Date"),
    snippet: decodeEntities(msg.snippet ?? ""),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    hasAttachment: parts.some((p) => !!p.filename),
  };
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Folders map to Gmail labels/queries over the whole mailbox (not just
// recent mail). Gmail returns results newest-first across all history;
// older mail is reached by following nextPageToken.
const FOLDER_QUERY: Record<string, { labelIds?: string[]; q?: string; spamTrash?: boolean }> = {
  inbox: { labelIds: ["INBOX"] },
  unread: { labelIds: ["UNREAD"] },
  starred: { labelIds: ["STARRED"] },
  important: { labelIds: ["IMPORTANT"] },
  sent: { labelIds: ["SENT"] },
  drafts: { labelIds: ["DRAFT"] },
  all: {},
  archive: { q: "-in:inbox -in:trash -in:spam -in:drafts -in:sent" },
  trash: { labelIds: ["TRASH"], spamTrash: true },
  attachments: { q: "has:attachment" },
};

/** One page of message rows for a folder, with optional search text. */
export async function listMail(
  connectionAPIKey: string,
  folder: string,
  search: string,
  pageToken?: string,
): Promise<{ rows: MailHeaderRow[]; nextPageToken: string | null; estimate: number }> {
  const config = FOLDER_QUERY[folder] ?? FOLDER_QUERY['inbox']!;
  const params = new URLSearchParams({ maxResults: "50" });
  for (const label of config.labelIds ?? []) params.append("labelIds", label);
  const q = [config.q, search].filter(Boolean).join(" ").trim();
  if (q) params.set("q", q);
  if (config.spamTrash) params.set("includeSpamTrash", "true");
  if (pageToken) params.set("pageToken", pageToken);

  const list = (await gmail(
    connectionAPIKey,
    `/gmail/v1/users/me/messages?${params.toString()}`,
  )) as { messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number };
  const estimate = list.resultSizeEstimate ?? 0;

  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return { rows: [], nextPageToken: list.nextPageToken ?? null, estimate };

  const details = await batchGetMetadata(connectionAPIKey, ids);
  const byId = new Map(details.map((m) => [m.id ?? "", m]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((m): m is GmailMessage => !!m)
    .map(toRow);

  return { rows, nextPageToken: list.nextPageToken ?? null, estimate };
}

/** Gmail multipart batch read: metadata for up to 25 messages per request. */
async function batchGetMetadata(
  connectionAPIKey: string,
  ids: string[],
): Promise<GmailMessage[]> {
  const out = new Map<string, GmailMessage>();
  // Smaller chunks stay under Gmail's per-user concurrency limits.
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    let pending = chunk;
    // Retry rate-limited parts with backoff so messages are never silently dropped.
    for (let attempt = 1; attempt <= 3 && pending.length > 0; attempt++) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
      const boundary = `studynova_${Math.random().toString(36).slice(2)}`;
      const body =
        pending
          .map(
            (id) =>
              `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date\r\n\r\n`,
          )
          .join("") + `--${boundary}--\r\n`;

      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: GMAIL_CONNECTOR,
        path: "/batch/gmail/v1",
        requiredScopes: GMAIL_SCOPES,
        init: {
          method: "POST",
          headers: { "Content-Type": `multipart/mixed; boundary=${boundary}` },
          body,
        },
      });
      if (await appUserReconnectRequired(res)) throw new ReconnectNeeded();
      const text = await res.text();
      if (!res.ok) {
        // Whole-batch 429: wait and retry the same chunk.
        if (res.status === 429) continue;
        console.error(`Gmail batch failed [${res.status}]: ${text.slice(0, 500)}`);
        throw new Error("We couldn't load your messages just now. Please try again.");
      }
      const contentType = res.headers.get("content-type") ?? "";
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      const responseBoundary = (boundaryMatch?.[1] ?? boundaryMatch?.[2] ?? "").trim();
      if (!responseBoundary) {
        // Some gateways answer a single JSON payload instead of MIME.
        try {
          const parsed = JSON.parse(text) as GmailMessage;
          if (parsed?.id) out.set(parsed.id, parsed);
        } catch {
          console.error("Gmail batch response was not multipart or JSON.");
        }
        break;
      }
      const failed: string[] = [];
      let partIndex = -1;
      for (const rawPart of text.split(`--${responseBoundary}`)) {
        const part = rawPart.trim();
        if (!part || part === "--") continue;
        partIndex++;
        const statusLine = part.match(/HTTP\/\d\.\d\s+(\d{3})/);
        const status = statusLine ? Number(statusLine[1]) : 0;
        const jsonStart = part.indexOf("{");
        if (jsonStart < 0) continue;
        const jsonText = part.slice(jsonStart, part.lastIndexOf("}") + 1);
        if (status >= 200 && status < 300) {
          try {
            const parsed = JSON.parse(jsonText) as GmailMessage;
            if (parsed?.id) out.set(parsed.id, parsed);
          } catch {
            console.error("Gmail batch part had invalid JSON.");
          }
        } else if (status === 429) {
          const failedId = pending[partIndex];
          if (failedId) failed.push(failedId);
        } else {
          console.error(`Gmail batch part failed [${status}]: ${jsonText.slice(0, 200)}`);
        }
      }
      pending = failed;
    }
    if (pending.length > 0) {
      console.error(`Gmail batch: ${pending.length} message(s) still rate-limited after retries.`);
    }
  }
  return [...out.values()];
}

/** Full message including body text for the reading pane. */
export async function readMail(connectionAPIKey: string, id: string): Promise<MailBody> {
  const msg = (await gmail(
    connectionAPIKey,
    `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
  )) as GmailMessage;

  const parts = flattenParts(msg.payload);
  let bodyText = "";
  let bodyHtml = "";
  const attachments: MailBody["attachments"] = [];

  for (const part of parts) {
    if (part.filename) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
      });
      continue;
    }
    const data = part.body?.data;
    if (!data) continue;
    if (part.mimeType === "text/plain" && !bodyText) bodyText = decodeBase64Url(data);
    if (part.mimeType === "text/html" && !bodyHtml) bodyHtml = decodeBase64Url(data);
  }

  if (!bodyText && bodyHtml) {
    bodyText = decodeEntities(
      bodyHtml
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, ""),
    ).trim();
  }

  return { ...toRow(msg), bodyText, bodyHtml, attachments };
}

export async function modifyLabels(
  connectionAPIKey: string,
  id: string,
  add: string[],
  remove: string[],
) {
  await gmail(connectionAPIKey, `/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

export async function trashMail(connectionAPIKey: string, id: string) {
  await gmail(connectionAPIKey, `/gmail/v1/users/me/messages/${encodeURIComponent(id)}/trash`, {
    method: "POST",
  });
}

const b64 = (s: string) =>
  Buffer.from(new TextEncoder().encode(s)).toString("base64");
const mimeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export async function sendMail(
  connectionAPIKey: string,
  input: { to: string; cc?: string; subject: string; body: string; threadId?: string; inReplyTo?: string },
) {
  const lines = [`To: ${input.to}`];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  lines.push(`Subject: ${mimeHeader(input.subject)}`);
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
  }
  lines.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', "", input.body);
  const raw = b64(lines.join("\r\n"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail(connectionAPIKey, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.threadId ? { raw, threadId: input.threadId } : { raw }),
  });
}

export async function readProfileEmail(connectionAPIKey: string): Promise<string | null> {
  const profile = (await gmail(connectionAPIKey, "/gmail/v1/users/me/profile")) as {
    emailAddress?: string;
  };
  return profile.emailAddress ?? null;
}

export async function unreadCount(connectionAPIKey: string): Promise<number> {
  const label = (await gmail(connectionAPIKey, "/gmail/v1/users/me/labels/INBOX")) as {
    messagesUnread?: number;
  };
  return label.messagesUnread ?? 0;
}
