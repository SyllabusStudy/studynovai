import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withTrialOrUserAiKey } from "./ai-key.server";
import { callAI } from "./ai.server";

export type GloAction =
  | { type: "none" }
  | { type: "navigate"; to: string }
  | { type: "note"; title: string; text: string }
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "theme"; mode: "light" | "dark" }
  | { type: "quiz"; className?: string; topic?: string; count?: number }
  | { type: "flashcards"; className?: string; topic?: string; count?: number };

const PAGES = ["/dashboard", "/classes", "/calendar", "/assignments", "/notes", "/grades", "/flashcards", "/quizzes", "/tutor", "/snapquick", "/quickvideo", "/lectures", "/studio", "/ai-checker", "/email", "/school", "/settings", "/upgrade"];

const SYSTEM = `You are Glo, the friendly blue voice assistant inside the SyllabusStudy study app. You hear the student by voice and your reply is spoken aloud, so keep "say" to 1-3 short natural sentences, no Markdown, no emoji.
Reply ONLY with JSON: {"say": string, "action": {...}}. Actions:
- {"type":"none"} — just answer (study questions, what's due, outside facts).
- {"type":"navigate","to": one of ${PAGES.join(", ")}} — open a page/tool (QuickVideo, lecture notes, etc.). Say what to do there.
- {"type":"note","title": string,"text": string} — create a note with the given content.
- {"type":"email","to": string,"subject": string,"body": string} — draft an email. "say" must be only a short question like "Can I send this email?" — never read the email.
- {"type":"quiz","className": string,"topic": string,"count": number} — actually CREATE a quiz from that class's materials. Use this whenever the student asks you to make a quiz, not "navigate".
- {"type":"flashcards","className": string,"topic": string,"count": number} — actually CREATE flashcards from that class's materials. Use this whenever the student asks for flashcards, not "navigate".
- {"type":"theme","mode":"light"|"dark"}.
Use the student's assignments below to answer what's due. Short follow-ups ("shorter", "yes", "the second one") refer to the previous turn. Never invent assignments.`;

export const gloCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      text: z.string().min(1).max(2000),
      path: z.string().max(200),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: due } = await context.supabase.from("assignments")
      .select("title,due_date,status").eq("user_id", context.userId).neq("status", "completed")
      .not("due_date", "is", null).order("due_date").limit(20);
    const list = (due ?? []).map((a) => `- ${a.title} (due ${a.due_date})`).join("\n") || "none";
    const raw = await withTrialOrUserAiKey(context.supabase, context.userId, "tutor", () =>
      callAI([
        { role: "system", content: `${SYSTEM}\nToday: ${today}. Current page: ${data.path}.\nOpen assignments:\n${list}` },
        ...data.history,
        { role: "user", content: data.text },
      ], { temperature: 0.3, maxTokens: 1200, reasoningEffort: "low", search: /look up|search|news|latest|who is|what is/i.test(data.text) }),
    );
    let parsed: { say?: string; action?: GloAction } = {};
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { parsed = { say: raw.slice(0, 400) }; }
    let action: GloAction = parsed.action ?? { type: "none" };
    if (action.type === "navigate" && !PAGES.includes(action.to)) action = { type: "none" };
    if (action.type === "note") {
      const text = String(action.text ?? "").slice(0, 20000);
      const content = { type: "doc", content: text.split(/\n+/).filter(Boolean).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) };
      const { data: note } = await context.supabase.from("personal_notes").insert({
        user_id: context.userId, title: String(action.title || "Glo note").slice(0, 120), title_is_auto: false,
        content, plain_text: text,
      }).select("id").single();
      if (!note) return { say: "Sorry, I couldn't save that note.", action: { type: "none" } as GloAction };
      return { say: parsed.say ?? "Saved it to your notes.", action: { type: "navigate", to: "/notes" } as GloAction };
    }
    return { say: String(parsed.say ?? "Okay."), action };
  });
