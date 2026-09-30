import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Which mail providers the Email page offers. Gmail is live today. */
export const MAIL_PROVIDERS = [
  { id: "google_mail", label: "Google / Gmail", available: true },
  { id: "microsoft_outlook", label: "Microsoft / Outlook", available: false },
  { id: "yahoo", label: "Yahoo Mail", available: false },
  { id: "icloud", label: "Apple / iCloud", available: false },
  { id: "imap", label: "School or other email", available: false },
] as const;

const RECONNECT = "reconnect_required";

/** Is this student's inbox connected, and which address? */
export const getMailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("./connection-keys.server");
    const conn = await getConnectionForUser(context.userId, "google_mail");
    if (!conn) return { connected: false, reconnectRequired: false, email: null as string | null };
    return {
      connected: !conn.reconnectRequired,
      reconnectRequired: conn.reconnectRequired,
      email: conn.accountEmail ?? null,
    };
  });

/** Hosts SyllableStudy itself is served from. The return page must land on the
 *  exact origin the student is browsing, or the popup can't hand the result
 *  back to the page that opened it. */
function safeReturnOrigin(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return fallback;
  const host = url.hostname;
  const allowed =
    host === "localhost" ||
    host === "studynova.link" ||
    host.endsWith(".studynova.link") ||
    host === "lovable.app" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com");
  return allowed ? url.origin : fallback;
}

/** Begin Google consent for this student's own inbox. */
export const startMailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ origin: z.string().max(300).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const clientKey = process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) throw new Error("Email connecting isn't set up yet. Please try again later.");

    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser } = await import("./connection-keys.server");
    const { GATEWAY_BASE_URL, GMAIL_SCOPES } = await import("./mail.server");

    const request = getRequest();
    if (!request) throw new Error("Connecting must start from the app.");
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const serverOrigin =
      url.hostname === "localhost" && forwardedHost ? `https://${forwardedHost}` : url.origin;
    const base = safeReturnOrigin(data.origin, serverOrigin);
    const returnUrl = new URL("/oauth/google/return", base).toString();

    const existing = await getConnectionForUser(context.userId, "google_mail");

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: "google_mail",
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing?.connectionAPIKey,
      credentialsConfiguration: { scopes: GMAIL_SCOPES },
    });
    return { authorizationUrl, returnUrl };
  });

/** Finish consent: store this student's connection securely. */
export const completeMailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL, readProfileEmail } = await import("./mail.server");
    const { saveConnectionKeyForUser, saveAccountEmail } = await import("./connection-keys.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== "google_mail") throw new Error("That sign-in didn't match your inbox.");

    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    let email: string | null = null;
    try {
      email = await readProfileEmail(connectionAPIKey);
      if (email) await saveAccountEmail(context.userId, connectorId, email);
    } catch (error) {
      console.error("Gmail profile lookup after connect failed", error);
    }
    return { ok: true, email };
  });

/** Remove this student's inbox connection. */
export const disconnectMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL } = await import("./mail.server");
    const { getConnectionForUser, deleteConnectionForUser } = await import(
      "./connection-keys.server"
    );
    const conn = await getConnectionForUser(context.userId, "google_mail");
    if (conn) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: conn.connectionAPIKey,
          connectorId: "google_mail",
        });
      } catch (error) {
        console.error("Gmail disconnect at provider failed", error);
      }
      await deleteConnectionForUser(context.userId, "google_mail");
    }
    return { ok: true };
  });

async function withMail<T>(
  userId: string,
  run: (key: string) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; reason: "not_connected" | "reconnect" }> {
  const { getConnectionForUser, markReconnectRequired } = await import("./connection-keys.server");
  const { ReconnectNeeded } = await import("./mail.server");
  const conn = await getConnectionForUser(userId, "google_mail");
  if (!conn) return { ok: false, reason: "not_connected" };
  if (conn.reconnectRequired) return { ok: false, reason: "reconnect" };
  try {
    return { ok: true, data: await run(conn.connectionAPIKey) };
  } catch (error) {
    if (error instanceof ReconnectNeeded || (error as Error)?.message === RECONNECT) {
      await markReconnectRequired(userId, "google_mail");
      return { ok: false, reason: "reconnect" };
    }
    throw error;
  }
}

export const listMailPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        folder: z.string().max(30).default("inbox"),
        search: z.string().max(200).default(""),
        pageToken: z.string().max(400).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listMail } = await import("./mail.server");
    return withMail(context.userId, (key) =>
      listMail(key, data.folder, data.search, data.pageToken),
    );
  });

export const readMailMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { readMail, modifyLabels } = await import("./mail.server");
    return withMail(context.userId, async (key) => {
      const message = await readMail(key, data.id);
      if (message.unread) {
        try {
          await modifyLabels(key, data.id, [], ["UNREAD"]);
          message.unread = false;
        } catch (error) {
          console.error("Marking message read failed", error);
        }
      }
      return message;
    });
  });

export const updateMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).max(120),
        action: z.enum(["star", "unstar", "read", "unread", "archive", "unarchive", "trash"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { modifyLabels, trashMail } = await import("./mail.server");
    return withMail(context.userId, async (key) => {
      switch (data.action) {
        case "star":
          await modifyLabels(key, data.id, ["STARRED"], []);
          break;
        case "unstar":
          await modifyLabels(key, data.id, [], ["STARRED"]);
          break;
        case "read":
          await modifyLabels(key, data.id, [], ["UNREAD"]);
          break;
        case "unread":
          await modifyLabels(key, data.id, ["UNREAD"], []);
          break;
        case "archive":
          await modifyLabels(key, data.id, [], ["INBOX"]);
          break;
        case "unarchive":
          await modifyLabels(key, data.id, ["INBOX"], []);
          break;
        case "trash":
          await trashMail(key, data.id);
          break;
      }
      return { done: true };
    });
  });

export const sendMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        to: z.string().min(3).max(500),
        cc: z.string().max(500).optional(),
        subject: z.string().max(400).default(""),
        body: z.string().max(50000).default(""),
        threadId: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sendMail } = await import("./mail.server");
    return withMail(context.userId, async (key) => {
      await sendMail(key, {
        to: data.to,
        subject: data.subject,
        body: data.body,
        ...(data.cc ? { cc: data.cc } : {}),
        ...(data.threadId ? { threadId: data.threadId } : {}),
      });
      return { sent: true };
    });
  });
