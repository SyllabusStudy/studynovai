import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotesAiAction = "ask" | "research" | "explain" | "improve" | "spelling" | "flashcards" | "quiz" | "guide" | "diagram" | "feedback";
export type NotesAiSuggestion = { original: string; suggestion: string; reason: string };
export type NotesAiSource = { title: string; url: string };
export type NotesAiDiagram = { title: string; layout: "flow" | "mind"; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };
export type NotesAiResult = {
  text: string;
  sources: NotesAiSource[];
  suggestions: NotesAiSuggestion[];
  cards: { front: string; back: string }[];
  quiz: { question: string; choices: string[]; answer: number; explanation: string }[];
  diagram: NotesAiDiagram | null;
  error: string | null;
};

const empty = (): NotesAiResult => ({ text: "", sources: [], suggestions: [], cards: [], quiz: [], diagram: null, error: null });

const STYLE = "Write plain readable Markdown (headings, bullets, **bold**). No LaTeX. No preamble or sign-offs.";
const CONTEXT = "Treat the note as informal live class notes that may contain phonetic spellings, speech-to-text errors, and typos. Infer the most likely intended everyday or course-related word from the surrounding sentences before answering. Prefer a simple contextual correction (for example, 'Gials' in criminal-justice notes likely means 'jails') over inventing an obscure concept. If two meanings are genuinely plausible, briefly ask which one the student meant instead of confidently guessing.";

function promptFor(action: NotesAiAction, note: string, focus: string, question: string, writeMode: string) {
  const notes = `STUDENT'S NOTE (their own words — never claim you changed it):\n"""\n${note.slice(0, 60_000)}\n"""`;
  const sel = focus ? `\nTHE PART THEY SELECTED:\n"""\n${focus.slice(0, 8000)}\n"""` : "";
  switch (action) {
    case "ask": return `You are SyllabusStudy's note-taking study assistant. ${CONTEXT} Answer the student's question clearly and with depth (short answer, explanation, an example). Use their full note as context when relevant, and fill gaps with your own knowledge. ${STYLE}\n\n${notes}${sel}\n\nQUESTION: ${question}`;
    case "explain": return `${CONTEXT} Explain the selected part (or the note's main idea if nothing is selected) in simple terms for a college student: plain explanation, an analogy, one example, and a common mistake. When a likely typo affects the explanation, state the likely correction naturally and explain that intended term. ${STYLE}\n\n${notes}${sel}${question ? `\n\nEXTRA REQUEST: ${question}` : ""}`;
    case "research": return `Research this topic using reliable outside sources (encyclopedias, textbooks, universities, government, reputable journals). Give a well-organized answer. ${STYLE}\nThen, at the very end, list every source you used, one per line, exactly as: SOURCE: <title> | <full https URL>\nOnly list real sources you actually used; if you have no URL, omit the source.\n\nTOPIC/QUESTION: ${question}\n\n(Background — the student's note, for context only:)\n${note.slice(0, 6000)}`;
    case "improve": return `You are a careful writing assistant. Improve the student's writing with the goal: ${writeMode}. Work on the selected part if given, otherwise the whole note. Do NOT rewrite everything — return individual suggestions the student can accept or reject. Each "original" MUST be copied EXACTLY, character for character, from the student's text (one sentence or phrase), and "suggestion" is your replacement. Max 15 suggestions.\nReturn ONLY JSON: {"suggestions":[{"original":"...","suggestion":"...","reason":"short reason"}]}\n\n${notes}${sel}`;
    case "spelling": return `${CONTEXT} Check the student's text for spelling and grammar mistakes only (no style rewrites). Use nearby sentences to correct phonetic or speech-to-text mistakes to the most likely intended word. Each "original" MUST be the exact misspelled word or short phrase copied character for character from the text, with "suggestion" the corrected version. Max 30.\nReturn ONLY JSON: {"suggestions":[{"original":"...","suggestion":"...","reason":"spelling|grammar: short note"}]}\n\n${notes}${sel}`;
    case "flashcards": return `Make 8-20 study flashcards from the student's note (selected part if given). Cover definitions, key facts, processes and examples. Return ONLY JSON: {"cards":[{"front":"question","back":"answer"}]}\n\n${notes}${sel}`;
    case "quiz": return `Write a 5-8 question multiple-choice quiz from the student's note (selected part if given). 4 choices each, one correct. Return ONLY JSON: {"quiz":[{"question":"...","choices":["a","b","c","d"],"answer":0,"explanation":"why"}]}\n\n${notes}${sel}`;
    case "guide": return `Turn the student's note into a study guide: ## Summary, ## Key points, ## Important terms (term — definition), ## Likely exam questions, ## What to review next. Base it on the note; clearly label any added background. ${STYLE}\n\n${notes}${sel}`;
    case "feedback": return `You are a friendly study coach glancing over a student's notes while they write. ${CONTEXT} Give 2-4 short, specific bullets of feedback: a factual mistake or misconception (most important), something unclear, a key idea that's missing, or a tip to remember it. Do not present a likely misspelling as a real concept. Be encouraging and concrete. Under 90 words total. If the notes are too short to comment on, return exactly: [none]\n${STYLE}\n\n${notes}`;
    case "diagram": return `Turn the student's note (selected part if given) into a diagram. Choose "flow" for processes/sequences/cause-effect, or "mind" for concepts around a central idea (node "n1" is the center). 4-12 nodes, labels under 6 words.${question ? ` Student request: ${question}.` : ""}\nReturn ONLY JSON: {"title":"...","layout":"flow"|"mind","nodes":[{"id":"n1","label":"..."}],"edges":[{"from":"n1","to":"n2","label":"optional short"}]}\n\n${notes}${sel}`;
  }
}

const historyItem = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) });

export const runNotesAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    action: z.enum(["ask", "research", "explain", "improve", "spelling", "flashcards", "quiz", "guide", "diagram", "feedback"]),
    noteText: z.string().max(200_000), selection: z.string().max(20_000).default(""),
    question: z.string().max(8000).default(""), writeMode: z.string().max(60).default("better wording"),
    history: z.array(historyItem).max(12).default([]),
  }).parse(d))
  .handler(async ({ context, data }): Promise<NotesAiResult> => {
    const out = empty();
    try {
      const { withUserAiKey } = await import("./ai-key.server");
      const { callAI, parseJsonBlock } = await import("./ai.server");
      const prompt = promptFor(data.action, data.noteText, data.selection, data.question, data.writeMode);
      const messages = data.action === "ask"
        ? [...data.history.map(h => ({ role: h.role, content: h.content })), { role: "user" as const, content: prompt }]
        : [{ role: "user" as const, content: prompt }];
      const raw = await withUserAiKey(context.supabase, context.userId, () =>
        callAI(messages, { maxTokens: 6000, temperature: data.action === "spelling" ? 0.1 : 0.3, search: data.action === "research" || data.action === "ask" }));
      if (["improve", "spelling"].includes(data.action)) {
        const j = parseJsonBlock<{ suggestions?: NotesAiSuggestion[] }>(raw);
        out.suggestions = (j.suggestions ?? []).filter(s => s?.original && s.suggestion && s.original !== s.suggestion).slice(0, 30);
      } else if (data.action === "flashcards") {
        out.cards = (parseJsonBlock<{ cards?: NotesAiResult["cards"] }>(raw).cards ?? []).filter(c => c?.front && c.back).slice(0, 30);
      } else if (data.action === "quiz") {
        out.quiz = (parseJsonBlock<{ quiz?: NotesAiResult["quiz"] }>(raw).quiz ?? []).filter(q => q?.question && Array.isArray(q.choices) && q.choices.length >= 2).slice(0, 10);
      } else if (data.action === "diagram") {
        const d = parseJsonBlock<NotesAiDiagram>(raw);
        const nodes = (d.nodes ?? []).filter(n => n?.id && n.label).slice(0, 14);
        const ids = new Set(nodes.map(n => n.id));
        out.diagram = { title: String(d.title ?? "Diagram").slice(0, 80), layout: d.layout === "mind" ? "mind" : "flow", nodes, edges: (d.edges ?? []).filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, 24) };
        if (!nodes.length) throw new Error("The AI couldn't find enough in this note to draw a diagram. Write a bit more first.");
      } else {
        const lines = raw.split("\n");
        for (const l of lines) {
          const m = l.match(/^\s*[-*]?\s*SOURCE:\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*$/i);
          if (m) out.sources.push({ title: m[1]!.slice(0, 200), url: m[2]! });
        }
        // Also pick up "Source: Name — https://..." style lines used elsewhere in the app.
        for (const m of raw.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g)) if (!out.sources.some(s => s.url === m[2])) out.sources.push({ title: m[1]!, url: m[2]! });
        out.text = lines.filter(l => !/^\s*[-*]?\s*SOURCE:\s*.+\|\s*https?:\/\//i.test(l)).join("\n").trim();
        out.sources = out.sources.slice(0, 12);
      }
      return out;
    } catch (e) {
      out.error = e instanceof Error && e.message ? e.message : "The AI couldn't answer right now. Try again in a moment.";
      return out;
    }
  });

export const saveNoteFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    deck: z.string().trim().min(1).max(200), classId: z.string().uuid().nullable(),
    cards: z.array(z.object({ front: z.string().min(1).max(2000), back: z.string().min(1).max(4000) })).min(1).max(40),
  }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.classId) {
      const { data: c } = await context.supabase.from("classes").select("id").eq("id", data.classId).eq("user_id", context.userId).maybeSingle();
      if (!c) throw new Error("Choose one of your own classes.");
    }
    const { error } = await context.supabase.from("flashcards").insert(data.cards.map(c => ({ user_id: context.userId, class_id: data.classId, deck: data.deck, front: c.front, back: c.back, topic: data.deck })));
    if (error) throw new Error("Flashcards couldn't be saved. Please try again.");
    return { count: data.cards.length };
  });
