import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanRef } from "./referral.functions";

const GMAIL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SITE = "https://syllabusstudy.com";
const LOGO = `${SITE}/icon-192.png`;
const SUBJECT_TAG = "SyllabusStudy";

export function referralLink(code: string) {
  return `${SITE}/?ref=${code}`;
}
export function qrUrl(code: string, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(referralLink(code))}`;
}

async function assertAdmin(supabase: Parameters<typeof import("./admin.server").isAdmin>[0], userId: string) {
  const { isAdmin } = await import("./admin.server");
  if (!(await isAdmin(supabase, userId))) throw new Error("This page is for the site owner only.");
}

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const gmail = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovable || !gmail) throw new Error("Team Gmail isn't connected yet.");
  return { lovable, gmail };
}

async function gmail(path: string, init?: RequestInit) {
  const k = keys();
  const res = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${k.lovable}`, "X-Connection-Api-Key": k.gmail },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Gmail failed [${res.status}] ${path}: ${text.slice(0, 400)}`);
    throw new Error(`Gmail error [${res.status}]: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
}

export const getOutreachStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    try {
      const p = (await gmail("/users/me/profile")) as { emailAddress?: string };
      let sent: { id: string; to: string; subject: string; date: string }[] = [];
      const list = (await gmail(`/users/me/messages?maxResults=25&q=${encodeURIComponent(`in:sent subject:"${SUBJECT_TAG}" "?ref="`)}`)) as { messages?: { id: string }[] };
      sent = await Promise.all(
        (list.messages ?? []).slice(0, 15).map(async (m) => {
          const d = (await gmail(`/users/me/messages/${m.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)) as { payload?: { headers?: { name: string; value: string }[] } };
          const h = (n: string) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
          return { id: m.id, to: h("To"), subject: h("Subject"), date: h("Date") };
        }),
      );
      return { connected: true, email: p.emailAddress ?? "", sent };
    } catch (e) {
      return { connected: false, email: "", sent: [], error: (e as Error).message };
    }
  });

type DraftIn = { name: string; code: string; channel?: string; notes?: string; senderName: string };

export const draftCreatorPitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: DraftIn) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const code = cleanRef(data.code);
    if (!code) throw new Error("Add a referral code.");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI drafting isn't configured.");
    const { fetchAiWithRetry } = await import("./ai-request.server");
    const system = [
      "You write short, human cold-outreach emails from a student founder to a college/study YouTuber.",
      "Product: SyllabusStudy (one word), an AI study app that turns syllabi, PDFs, assignments and YouTube lectures into notes, flashcards, quizzes and study plans.",
      "Offer: free SyllabusStudy Pro, and 25% commission on eligible Pro subscriptions from students who sign up with their referral link.",
      "No pressure to recommend it if they don't like it. Under 150 words. No emoji, no hype, no invented facts.",
      "Do NOT include the link, signature or sign-off; those are added automatically.",
      `Subject must include the word ${SUBJECT_TAG} and be under 60 characters. Body uses blank lines between paragraphs and starts with "Hey <name>,".`,
    ].join(" ");
    const res = await fetchAiWithRetry("lovable", AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: system,
        input: [{ role: "user", content: `Creator: ${data.name}\nChannel: ${data.channel ?? ""}\nPersonal details / my instructions: ${data.notes ?? ""}` }],
        text: {
          format: {
            type: "json_schema",
            name: "pitch",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["subject", "body"],
              properties: { subject: { type: "string" }, body: { type: "string" } },
            },
          },
        },
      }),
    });
    if (!res.ok || !res.body) {
      console.error("Pitch draft failed", res.status, (await res.text()).slice(0, 300));
      throw new Error("Couldn't write the pitch just now. Try again.");
    }
    let raw = "";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) raw += ev.delta;
        } catch { /* ignore partial */ }
      }
    }
    raw = raw.trim();
    try {
      const p = JSON.parse(raw) as { subject?: string; body?: string };
      let subject = String(p.subject ?? "").slice(0, 120);
      if (!subject.includes(SUBJECT_TAG)) subject = `${subject} | ${SUBJECT_TAG}`.trim();
      return { subject, body: String(p.body ?? "") };
    } catch {
      throw new Error("The draft came back garbled. Try again.");
    }
  });

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export function buildPitch(body: string, code: string, senderName: string) {
  const link = referralLink(code);
  const paras = body.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#222">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px">${paras}
<p style="margin:18px 0 6px;font-size:15px;color:#222">Your personal referral link: <a href="${link}">${link}</a></p>
<p style="margin:0 0 18px"><img src="${qrUrl(code, 220)}" width="160" height="160" alt="QR code for your referral link"></p>
<p style="margin:0;font-size:15px;color:#222">Best,<br>${esc(senderName)}<br>Founder, SyllabusStudy<br><a href="${SITE}">${SITE.replace("https://", "")}</a></p>
<p style="margin:16px 0 0"><img src="${LOGO}" width="40" height="40" alt="SyllabusStudy" style="border-radius:10px"></p>
<p style="margin:14px 0 0;font-size:12px;color:#888">If you'd rather not hear from me again, just reply and let me know.</p></div>`;
  const text = `${body.trim()}\n\nYour personal referral link: ${link}\nQR code: ${qrUrl(code)}\n\nBest,\n${senderName}\nFounder, SyllabusStudy\n${SITE}\n\nIf you'd rather not hear from me again, just reply and let me know.`;
  return { html, text, link };
}

export const sendCreatorPitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; subject: string; body: string; code: string; senderName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const code = cleanRef(data.code);
    const to = data.to.trim();
    if (!code) throw new Error("Add a referral code.");
    if (!/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(to)) throw new Error("That email address doesn't look right.");
    if (!data.subject.trim() || !data.body.trim()) throw new Error("Subject and message can't be empty.");
    const { html, text } = buildPitch(data.body, code, data.senderName.trim() || "David");
    const boundary = `b_${crypto.randomUUID()}`;
    const mime = [
      `To: ${to}`,
      `Subject: ${hdr(data.subject.trim())}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(text),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(html),
      `--${boundary}--`,
    ].join("\r\n");
    const raw = b64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await gmail("/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    return { ok: true };
  });
