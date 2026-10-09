import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withTrialOrUserAiKey } from "./ai-key.server";
import { callAI } from "./ai.server";
import { runQuizGeneration, runFlashcardGeneration } from "./study.server";
import { GLO_FREE_DAILY_TASKS, GLO_TASK_KIND, gloTasksLeft, isGloTask } from "./glo-limit";

export type GloAction =
  | { type: "none" }
  | { type: "navigate"; to: string }
  | { type: "note"; title: string; text: string }
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "theme"; mode: "light" | "dark" }
  | { type: "quiz"; className?: string; topic?: string; noteTitle?: string; count?: number }
  | { type: "flashcards"; className?: string; topic?: string; noteTitle?: string; count?: number };

const PAGES = ["/dashboard", "/classes", "/calendar", "/assignments", "/notes", "/grades", "/flashcards", "/quizzes", "/tutor", "/snapquick", "/quickvideo", "/lectures", "/studio", "/ai-checker", "/email", "/school", "/settings", "/upgrade"];

const SYSTEM = `You are Glo, the friendly blue voice assistant inside the SyllabusStudy study app. You hear the student by voice and your reply is spoken aloud, so keep "say" to 1-3 short natural sentences, no Markdown, no emoji.
Reply ONLY with JSON: {"say": string, "action": {...}}. Actions:
- {"type":"none"} — just answer (study questions, what's due, outside facts). Always give a real, correct answer from your knowledge; never say "I don't know" for normal study questions.
- {"type":"navigate","to": one of PAGES} — open a page ONLY if the student explicitly asks to go/open/take them there. Otherwise do the task yourself in the background and say it's done so they can review it later.
- {"type":"note","title": string,"text": string} — create an ADVANCED college-level study note. "text" is Markdown: "# Title"-free; use "## " section headings (Overview, Key Terms, How It Works / Step by Step, Examples, Common Mistakes & Exam Tips, Quick Summary), "- " bullets, "1. " numbered steps, and **bold** key terms with precise definitions. Be thorough (300-900 words), accurate and specific — real formulas, dates, mechanisms, examples. "say" is only a short confirmation.
- {"type":"email","to": string,"subject": string,"body": string} — draft an email. "say" must be only a short question like "Can I send this email?" — never read the email.
- {"type":"quiz","className": string,"topic": string,"noteTitle": string,"count": number} — actually CREATE a quiz. "topic" = the EXACT topic the student named, word for word (empty only if none). "noteTitle" = the note/document name if they mention a specific note ("my photosynthesis note"), else "". className = the class they named, else "".
- {"type":"flashcards", same fields} — actually CREATE flashcards the same way.
- {"type":"theme","mode":"light"|"dark"}.
"say" for quiz/flashcards must name the exact topic (e.g. "Making 10 flashcards on mitosis now.").
Use the student's assignments below to answer what's due. Short follow-ups ("shorter", "yes", "the second one", "make it on that") refer to the previous turn. Never invent assignments.
When a screenshot of the student's screen is attached, look at it carefully and answer about what is on it. If they ask you to take notes on it, use the "note" action with an advanced structured note built from the screen content.`.replace("PAGES", PAGES.join(", "));

const SEARCH = /\b(look (it |this )?up|search (online|the web|google)|google it|on the (web|internet)|online|latest|news|today'?s|current(ly)?|right now|this week in|score|weather|price of)\b/i;

type Inline = { type: "text"; text: string; marks?: { type: string }[] };
function inline(s: string): Inline[] {
  const out: Inline[] = [];
  s.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    const b = part.match(/^\*\*(.+)\*\*$/);
    out.push(b ? { type: "text", text: b[1]!, marks: [{ type: "bold" }] } : { type: "text", text: part });
  });
  return out.length ? out : [{ type: "text", text: " " }];
}
/** Markdown (headings, bullets, numbered, bold) → Tiptap JSON. */
function mdToDoc(md: string) {
  const content: unknown[] = [];
  let list: { kind: "bulletList" | "orderedList"; items: unknown[] } | null = null;
  const flush = () => { if (list) { content.push({ type: list.kind, content: list.items }); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) { flush(); content.push({ type: "heading", attrs: { level: Math.min(3, h[1]!.length + 1) }, content: inline(h[2]!) }); }
    else if (ul || ol) {
      const kind = ul ? "bulletList" : "orderedList";
      if (!list || list.kind !== kind) { flush(); list = { kind, items: [] }; }
      list.items.push({ type: "listItem", content: [{ type: "paragraph", content: inline((ul ?? ol)![1]!) }] });
    } else { flush(); content.push({ type: "paragraph", content: inline(line) }); }
  }
  flush();
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

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
    const [{ data: due }, { data: classes }, { data: notes }] = await Promise.all([
      context.supabase.from("assignments").select("title,due_date,status").eq("user_id", context.userId).neq("status", "completed")
        .not("due_date", "is", null).order("due_date").limit(20),
      context.supabase.from("classes").select("id,class_name").eq("user_id", context.userId),
      context.supabase.from("personal_notes").select("id,title,class_id").eq("user_id", context.userId).order("updated_at", { ascending: false }).limit(40),
    ]);
    const list = (due ?? []).map((a) => `- ${a.title} (due ${a.due_date})`).join("\n") || "none";
    const classList = (classes ?? []).map((c) => c.class_name).join(", ") || "none";
    const noteList = (notes ?? []).map((n) => n.title).filter(Boolean).slice(0, 40).join(" | ") || "none";
    const wantsNote = /\bnotes?\b/i.test(data.text) && /\b(make|write|create|take|add|save)\b/i.test(data.text);
    const raw = await withTrialOrUserAiKey(context.supabase, context.userId, "tutor", () =>
      callAI([
        { role: "system", content: `${SYSTEM}\nToday: ${today}. Current page: ${data.path}.\nClasses: ${classList}\nNote titles: ${noteList}\nOpen assignments:\n${list}` },
        ...data.history,
        data.screen
          ? { role: "user", content: [{ type: "text", text: `[Screenshot of my screen attached]\n${data.text}` }, { type: "image_url", image_url: { url: data.screen } }] }
          : { role: "user", content: data.text },
      ], { temperature: 0.3, maxTokens: data.screen || wantsNote ? 3500 : 900, reasoningEffort: "low", search: SEARCH.test(data.text) }),
    );
    let parsed: { say?: string; action?: GloAction } = {};
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { parsed = { say: raw.slice(0, 400) }; }
    let action: GloAction = parsed.action ?? { type: "none" };
    if (action.type === "navigate" && !PAGES.includes(action.to)) action = { type: "none" };

    if (isGloTask(action.type)) {
      const { isPro } = await import("./billing.server");
      const pro = await isPro(context.supabase, context.userId);
      if (!pro) {
        const { hasUserAiKey } = await import("./ai-key.server");
        const hasKey = await hasUserAiKey(context.supabase, context.userId);
        if (!hasKey) {
          // Brand-new accounts without their own key get exactly one free Glo task, ever.
          const { count } = await context.supabase.from("usage_events").select("id", { count: "exact", head: true })
            .eq("user_id", context.userId).eq("kind", GLO_TASK_KIND);
          if ((count ?? 0) >= 1) {
            return { say: "Add your own free A-P-I key or use the other tools until then! Goodbye!", action: { type: "none" } as GloAction };
          }
          await context.supabase.from("usage_events").insert({ user_id: context.userId, kind: GLO_TASK_KIND });
        } else {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count } = await context.supabase.from("usage_events").select("id", { count: "exact", head: true })
            .eq("user_id", context.userId).eq("kind", GLO_TASK_KIND).gte("created_at", since);
          if (gloTasksLeft(count ?? 0, false) <= 0) {
            return { say: `You've used your ${GLO_FREE_DAILY_TASKS} free Glo tasks for today. Upgrade to Pro for unlimited tasks, or try again tomorrow.`, action: { type: "none" } as GloAction };
          }
          await context.supabase.from("usage_events").insert({ user_id: context.userId, kind: GLO_TASK_KIND });
        }
      }
    }


    if (action.type === "quiz" || action.type === "flashcards") {
      const kind = action.type;
      const count = Math.min(20, Math.max(5, Math.round(Number(action.count) || 10)));
      const topic = action.topic ? String(action.topic).trim().slice(0, 200) : "";
      const lc = (s: string) => s.toLowerCase();
      // Specific note requested? Match by title, then by topic words.
      const noteWant = lc(String(action.noteTitle ?? "").trim());
      const note = noteWant
        ? (notes ?? []).find((n) => n.title && (lc(n.title).includes(noteWant) || noteWant.includes(lc(n.title))))
        : undefined;
      const want = lc(String(action.className ?? "").trim());
      const cls = (note?.class_id && classes?.find((c) => c.id === note.class_id))
        || (want ? (classes ?? []).find((c) => lc(c.class_name).includes(want) || want.includes(lc(c.class_name))) : undefined)
        || (classes ?? [])[0];
      if (!cls) return { say: "You don't have any classes yet — add one first, then I can make those for you.", action: { type: "navigate", to: "/classes" } as GloAction };
      if (noteWant && !note) return { say: `I couldn't find a note called "${action.noteTitle}". Which note did you mean?`, action: { type: "none" } as GloAction };
      try {
        if (kind === "quiz") {
          await withTrialOrUserAiKey(context.supabase, context.userId, "tools", () =>
            runQuizGeneration(context.supabase, context.userId, {
              classId: cls.id, count, difficulty: "medium", types: ["multiple_choice"],
              noteIds: note ? [note.id] : undefined, topic: topic || null, allowGeneral: Boolean(topic) && !note,
              title: topic ? `Glo: ${topic}` : note ? `Glo: ${note.title}` : null,
            }),
          );
        } else {
          let sourceOverride: string | null = null;
          if (note) {
            const { data: n } = await context.supabase.from("personal_notes").select("title,plain_text").eq("id", note.id).eq("user_id", context.userId).maybeSingle();
            sourceOverride = n?.plain_text ? `${n.title}\n${n.plain_text}` : null;
            if (!sourceOverride) return { say: "That note is empty — add some notes first.", action: { type: "none" } as GloAction };
          }
          await withTrialOrUserAiKey(context.supabase, context.userId, "tools", () =>
            runFlashcardGeneration(context.supabase, context.userId, {
              classId: cls.id, count, difficulty: "medium", topic: topic || null, sourceOverride, allowGeneral: Boolean(topic) && !note,
            }),
          );
        }
        const what = kind === "quiz" ? "quiz" : "flashcards";
        const on = topic ? ` on ${topic}` : note ? ` from your "${note.title}" note` : "";
        return { say: `Done — your ${cls.class_name} ${what}${on} ${kind === "quiz" ? "is" : "are"} ready to review.`, action: { type: "none" } as GloAction };
      } catch (e) {
        return { say: e instanceof Error ? e.message.slice(0, 160) : "Sorry, I couldn't build that right now.", action: { type: "none" } as GloAction };
      }
    }
    if (action.type === "note") {
      const text = String(action.text ?? "").slice(0, 30000);
      const plain = text.replace(/\*\*/g, "").replace(/^#{1,3}\s+/gm, "");
      const { data: note } = await context.supabase.from("personal_notes").insert({
        user_id: context.userId, title: String(action.title || "Glo note").slice(0, 120), title_is_auto: false,
        content: mdToDoc(text) as never, plain_text: plain,
      }).select("id").single();
      if (!note) return { say: "Sorry, I couldn't save that note.", action: { type: "none" } as GloAction };
      return { say: parsed.say ?? "Saved it to your notes.", action: { type: "none" } as GloAction };
    }
    return { say: String(parsed.say ?? "Okay."), action };
  });
