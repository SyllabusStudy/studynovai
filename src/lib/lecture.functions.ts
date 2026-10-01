import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LectureAi = {
  title?: string;
  transcript?: string;
  summary?: string;
  key_concepts?: string[];
  flashcards?: Array<{ front: string; back: string }>;
};

const PROMPT = `You are SyllabusStudy, an expert note-taker for college students. Listen carefully to this whole recording. First figure out what it is: a class lecture, someone reading a book/textbook aloud, a discussion, or just a talk/voice memo. Adapt your notes to that type.

Return ONLY JSON:
{"title": "specific title naming the topic (and chapter/book if it is a reading)",
 "transcript": "clean full transcript (remove filler words like um/uh, keep ALL content, keep speaker changes as new paragraphs)",
 "summary": "detailed study notes in Markdown (see rules)",
 "key_concepts": ["the most likely exam concepts, one short line each", "..."],
 "flashcards": [{"front": "question", "back": "answer"}]}

SUMMARY RULES (be thorough and detailed, not brief):
- Start with "**Type:** Lecture / Book reading / Discussion / Talk" and a 2-3 sentence overview.
- "## Main topics": a heading per topic in the order covered, with detailed bullets: explanations, reasoning, causes/effects, steps of processes.
- "## Key terms & definitions": every term defined or emphasized, with its definition.
- "## Formulas, dates, names & numbers": every formula (with what each variable means), date, person, place, statistic or figure mentioned.
- "## Examples": every example, case, story or worked problem, with how it connects to the idea.
- For a book: also note characters, plot points, themes, quotes and the author's main argument.
- "## Professor emphasis": anything said to be important, "on the test", repeated, or assigned (homework, readings, deadlines) — quote the exact words when possible.
- "## Helpful background": a few short bullets of standard, well-established context that a student would need to understand this material (prerequisite ideas, a definition the speaker assumed), clearly labeled as added background.
- "## Review questions": 3-5 questions to self-test.
- Write formulas in $...$.

Make 12-30 flashcards covering definitions, formulas, dates, examples and exam-emphasized ideas. Everything except "Helpful background" must come from the recording; never invent what the speaker said. If the audio has no understandable speech, return {"transcript": ""}.`;

export const createLectureNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        audio: z.string().min(100).max(40_000_000),
        mimeType: z
          .string()
          .max(120)
          .transform((v) => (v || "").split(";")[0]!.trim().toLowerCase())
          .transform((v) => (/^(audio|video)\/[\w.+-]+$/.test(v) ? v : "audio/webm")),
        fileName: z.string().max(200),
        classId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { withUserAiKey } = await import("./ai-key.server");
    const { callAI, parseJsonBlock } = await import("./ai.server");
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "lecture");
    const mime = data.mimeType.split(";")[0] ?? "audio/webm";
    const raw = await withUserAiKey(context.supabase, context.userId, () =>
      callAI([
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "file", file: { filename: data.fileName || "lecture", file_data: `data:${mime};base64,${data.audio}` } },
          ],
        },
      ], { maxTokens: 16000, temperature: 0.2 }),
    );
    let ai: LectureAi;
    try {
      ai = parseJsonBlock<LectureAi>(raw);
    } catch {
      // Long recordings can overflow the reply; retry with a shorter answer (no full transcript).
      const short = await withUserAiKey(context.supabase, context.userId, () =>
        callAI([
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT.replace('"clean full transcript (remove filler words like um/uh, keep ALL content, keep speaker changes as new paragraphs)"', '"a short 3-6 sentence recap of what was said (NOT a full transcript)"') },
              { type: "file", file: { filename: data.fileName || "lecture", file_data: `data:${mime};base64,${data.audio}` } },
            ],
          },
        ], { maxTokens: 16000, temperature: 0.2 }),
      );
      ai = parseJsonBlock<LectureAi>(short);
    }
    if (!ai.transcript?.trim()) throw new Error("We couldn't hear any speech in that recording. Try a clearer or longer one.");

    const title = (ai.title || data.fileName || "Lecture").slice(0, 200);
    const deck = `Lecture: ${title}`.slice(0, 200);
    const cards = (ai.flashcards ?? []).filter((c) => c?.front && c?.back).slice(0, 30);
    if (cards.length) {
      const { error } = await context.supabase.from("flashcards").insert(
        cards.map((c) => ({ user_id: context.userId, class_id: data.classId, deck, front: c.front, back: c.back, topic: title })),
      );
      if (error) throw new Error(error.message);
    }
    const { data: row, error } = await context.supabase
      .from("lecture_notes")
      .insert({
        user_id: context.userId,
        class_id: data.classId,
        title,
        transcript: ai.transcript,
        summary: ai.summary ?? "",
        key_concepts: (ai.key_concepts ?? []).slice(0, 30),
        deck: cards.length ? deck : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordUsage(context.supabase, context.userId, "lecture");
    return { id: row.id, cards: cards.length };
  });
