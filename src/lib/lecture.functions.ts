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

const PROMPT = `You are SyllabusStudy. Listen to this class lecture recording and return ONLY JSON:
{"title": "short lecture title",
 "transcript": "clean full transcript of what the professor said (remove filler words, keep all content)",
 "summary": "study notes in Markdown: headings, bullet points, definitions, formulas in $...$",
 "key_concepts": ["the most likely exam concepts, one short line each", "..."],
 "flashcards": [{"front": "question", "back": "answer"}]}
Make 8-20 flashcards covering the most testable ideas. Only use what is in the recording; never invent facts. If the audio has no understandable speech, return {"transcript": ""}.`;

export const createLectureNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        audio: z.string().min(100).max(28_000_000),
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
      ]),
    );
    const ai = parseJsonBlock<LectureAi>(raw);
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
    return { id: row.id, cards: cards.length };
  });
