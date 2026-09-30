/** Owner announcement emails: AI drafting plus real sending through Resend. */
import { fetchAiWithRetry } from "./ai-request.server";
import type { Draft } from "./announce";

export const FROM_ADDRESS = "SyllabusStudy <news@studynova.link>";
export const REPLY_TO = "news@studynova.link";
const SITE_URL = "https://studynovai.lovable.app";
const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const BATCH_SIZE = 100;

export type { Draft };

const TONES: Record<string, string> = {
  exciting: "upbeat and energetic, like great news a friend is sharing",
  academic: "calm, clear and professional, respectful of a student's time",
  helpful: "warm, supportive and practical",
  short: "extremely short and punchy, two or three sentences at most",
};

function fence(value: string) {
  return value.replace(/```json|```/g, "").trim();
}

/** Writes the announcement copy with Lovable AI so no student key is used. */
export async function draftAnnouncement(prompt: string, tone: string): Promise<Draft> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Email drafting is not configured yet.");

  const response = await fetchAiWithRetry("lovable", AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: [
            "You write announcement emails for SyllabusStudy, a college study app. Tagline: Your semester, made simple.",
            `Tone: ${TONES[tone] ?? TONES["helpful"]}.`,
            "Write to college students. No emoji spam, no fake urgency, no invented prices, dates or features.",
            "Only use facts given in the request. Never promise anything not stated.",
            'Reply with JSON only: {"subject":"","preview":"","heading":"","paragraphs":["",""],"ctaLabel":"","ctaUrl":""}',
            "subject under 60 characters. preview under 90 characters. 2-4 short paragraphs. ctaUrl must be a SyllabusStudy page such as",
            `${SITE_URL}/upgrade or ${SITE_URL}/dashboard, or leave ctaLabel and ctaUrl empty.`,
          ].join(" "),
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    console.error("Announcement draft failed", { status: response.status, body });
    throw new Error("Could not write the email just now. Try again.");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  let parsed: Partial<Draft>;
  try {
    parsed = JSON.parse(fence(raw)) as Partial<Draft>;
  } catch {
    throw new Error("Could not read the drafted email. Try again.");
  }

  const paragraphs = (parsed.paragraphs ?? []).filter((p) => typeof p === "string" && p.trim()).slice(0, 5);
  if (!parsed.subject || paragraphs.length === 0) throw new Error("The draft came back empty. Try again.");

  return {
    subject: String(parsed.subject).slice(0, 120),
    preview: String(parsed.preview ?? "").slice(0, 140),
    heading: String(parsed.heading ?? parsed.subject).slice(0, 120),
    paragraphs,
    ctaLabel: parsed.ctaLabel ? String(parsed.ctaLabel).slice(0, 40) : undefined,
    ctaUrl: parsed.ctaUrl?.startsWith(SITE_URL) ? parsed.ctaUrl : undefined,
  };
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** SyllabusStudy-branded email markup, with the unsubscribe footer every send needs. */
export function renderAnnouncement(draft: Draft, unsubscribeUrl: string) {
  const body = draft.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#3f4657">${escape(p)}</p>`)
    .join("");
  const cta =
    draft.ctaLabel && draft.ctaUrl
      ? `<p style="margin:26px 0 8px"><a href="${escape(draft.ctaUrl)}" style="display:inline-block;background:#4f46c5;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:12px">${escape(draft.ctaLabel)}</a></p>`
      : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(draft.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escape(draft.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;padding:28px 24px 8px">
<tr><td style="padding-bottom:22px;font-size:18px;font-weight:700;color:#4f46c5;letter-spacing:-0.2px">SyllabusStudy</td></tr>
<tr><td><h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#161a24">${escape(draft.heading)}</h1>${body}${cta}</td></tr>
<tr><td style="padding:28px 0 32px;border-top:1px solid #e6e8ef">
<p style="margin:18px 0 6px;font-size:12px;line-height:1.6;color:#8a91a3">SyllabusStudy — Your semester, made simple.</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#8a91a3">You get this because you have a SyllabusStudy account. <a href="${escape(unsubscribeUrl)}" style="color:#8a91a3">Unsubscribe from announcements</a>.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    draft.heading,
    "",
    ...draft.paragraphs,
    draft.ctaUrl ? `\n${draft.ctaLabel}: ${draft.ctaUrl}` : "",
    "",
    "SyllabusStudy — Your semester, made simple.",
    `Unsubscribe from announcements: ${unsubscribeUrl}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { html, text };
}

function unsubscribeUrl(userId: string) {
  return `${SITE_URL}/unsubscribe?u=${userId}`;
}

export async function listRecipients() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, notify_news")
    .eq("notify_news", true)
    .not("email", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => !!r.email) as Array<{ id: string; email: string }>;
}

export async function listAnnouncementHistory() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("announcements")
    .select("id, subject, recipients, failed, sent_at")
    .order("sent_at", { ascending: false })
    .limit(25);
  return data ?? [];
}

/** Sends one announcement to every student who still wants them. */
export async function sendAnnouncement(
  adminId: string,
  draft: Draft,
  prompt: string,
  testTo?: string,
) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) throw new Error("Email sending is not connected yet.");

  const recipients = testTo
    ? [{ id: adminId, email: testTo }]
    : await listRecipients();
  if (recipients.length === 0) throw new Error("No students are signed up for announcements yet.");

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emails = chunk.map((r) => {
      const url = unsubscribeUrl(r.id);
      const { html, text } = renderAnnouncement(draft, url);
      return {
        from: FROM_ADDRESS,
        to: [r.email],
        reply_to: REPLY_TO,
        subject: draft.subject,
        html,
        text,
        headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });

    const response = await fetch(`${RESEND_GATEWAY}/emails/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify(emails),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 600);
      console.error("Announcement send failed", { status: response.status, body });
      failed += chunk.length;
      if (i === 0) throw new Error(`Sending failed [${response.status}]: ${body}`);
      continue;
    }
    sent += chunk.length;
  }

  if (!testTo) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("announcements").insert({
      created_by: adminId,
      subject: draft.subject,
      preview_text: draft.preview,
      body_html: renderAnnouncement(draft, unsubscribeUrl(adminId)).html,
      body_text: renderAnnouncement(draft, unsubscribeUrl(adminId)).text,
      prompt,
      recipients: sent,
      failed,
    });
  }

  return { sent, failed, test: !!testTo };
}

/** One-click unsubscribe from the email footer. */
export async function unsubscribeStudent(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ notify_news: false })
    .eq("id", userId)
    .select("email")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { ok: !!data, email: data?.email ?? null };
}
