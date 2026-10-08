import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withTrialOrUserAiKey } from "./ai-key.server";
import { callAI } from "./ai.server";
import { runQuizGeneration, runFlashcardGeneration } from "./study.server";

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
Use the student's assignments below to answer what's due. Short follow-ups ("shorter", "yes", "the second one") refer to the previous turn. Never invent assignments.
When a screenshot of the student's screen is attached, look at it carefully and answer about what is on it (graphs, steps, slides, text). If they ask you to take notes on it, use the "note" action with a well-structured study note (headings on their own lines, short bullet lines starting with "- ", key terms and definitions) built from the screen content, and "say" just a short confirmation.`;

export const gloCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      text: z.string().min(1).max(2000),
      path: z.string().max(200),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(8),
      screen: z.string().startsWith("data:image/").max(6_000_000).optional(),
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
        data.screen
          ? { role: "user", content: [{ type: "text", text: `[Screenshot of my screen attached]\n${data.text}` }, { type: "image_url", image_url: { url: data.screen } }] }
          : { role: "user", content: data.text },
      ], { temperature: 0.3, maxTokens: data.screen ? 2500 : 1200, reasoningEffort: "low", search: /look up|search|news|latest|who is|what is/i.test(data.text) }),
    );
    let parsed: { say?: string; action?: GloAction } = {};
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { parsed = { say: raw.slice(0, 400) }; }
    let action: GloAction = parsed.action ?? { type: "none" };
    if (action.type === "navigate" && !PAGES.includes(action.to)) action = { type: "none" };
    if (action.type === "quiz" || action.type === "flashcards") {
      const kind = action.type;
      const count = Math.min(20, Math.max(5, Math.round(Number(action.count) || 10)));
      const { data: classes } = await context.supabase.from("classes").select("id,class_name").eq("user_id", context.userId);
      const want = String(action.className ?? "").toLowerCase();
      const cls = (classes ?? []).find((c) => c.class_name.toLowerCase().includes(want) || want.includes(c.class_name.toLowerCase())) ?? classes?.[0];
      if (!cls) return { say: "You don't have any classes yet — add one first, then I can make those for you.", action: { type: "navigate", to: "/classes" } as GloAction };
      try {
        const topic = action.topic ? String(action.topic).slice(0, 200) : null;
        if (kind === "quiz") {
          await withTrialOrUserAiKey(context.supabase, context.userId, "tools", () =>
            runQuizGeneration(context.supabase, context.userId, { classId: cls.id, count, difficulty: "medium", types: ["multiple_choice"], title: topic ? `Glo: ${topic}` : null }),
          );
          return { say: parsed.say ?? `Done — your ${cls.class_name} quiz is ready.`, action: { type: "navigate", to: "/quizzes" } as GloAction };
        }
        await withTrialOrUserAiKey(context.supabase, context.userId, "tools", () =>
          runFlashcardGeneration(context.supabase, context.userId, { classId: cls.id, count, difficulty: "medium", topic }),
        );
        return { say: parsed.say ?? `Done — your ${cls.class_name} flashcards are ready.`, action: { type: "navigate", to: "/flashcards" } as GloAction };
      } catch {
        return { say: "Sorry, I couldn't build that right now — try again in a moment.", action: { type: "none" } as GloAction };
      }
    }
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
