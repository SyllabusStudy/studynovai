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

const TRANSCRIBE_PROMPT = `You are transcribing one piece of a college class recording made on a student's phone.

FOCUS ON THE MAIN SPEAKER ONLY:
- The main speaker is the professor/lecturer: the person doing most of the talking and teaching. They may sound FAR AWAY, quiet or echoey (at the front of the room). Listen hard and transcribe them fully.
- IGNORE everyone else: nearby students whispering or chatting, side conversations, phone/bag noise, coughs, laughter, comments unrelated to the lesson — even when those voices are louder because they are close to the phone.
- Only include another person if the professor is answering their question as part of the lesson; write it as "Student: ..." briefly.
- Remove filler words (um, uh). Never invent words; if a short part is unclear, write [unclear].

Return ONLY the plain transcript text, in paragraphs. If there is no lecture speech at all, return exactly: [no speech]`;

export const transcribeLecturePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        audio: z.string().min(100).max(20_000_000),
        mimeType: z
          .string()
          .max(120)
          .transform((v) => (v || "").split(";")[0]!.trim().toLowerCase())
          .transform((v) => (/^(audio|video)\/[\w.+-]+$/.test(v) ? v : "audio/wav")),
        index: z.number().int().min(0).max(100),
        total: z.number().int().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { withUserAiKey } = await import("./ai-key.server");
    const { callAI } = await import("./ai.server");
    if (data.index === 0) {
      const { assertQuota } = await import("./billing.server");
      await assertQuota(context.supabase, context.userId, "lecture");
    }
    const run = () =>
      withUserAiKey(context.supabase, context.userId, () =>
        callAI([
          {
            role: "user",
            content: [
              { type: "text", text: `${TRANSCRIBE_PROMPT}\n\n(This is part ${data.index + 1} of ${data.total}.)` },
              { type: "file", file: { filename: `part-${data.index + 1}`, file_data: `data:${data.mimeType};base64,${data.audio}` } },
            ],
          },
        ], { maxTokens: 8000, temperature: 0.1 }),
      );
    let text: string;
    try {
      text = await run();
    } catch (e) {
      if (e instanceof Error && /free limit|API key|did not allow/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 2500));
      text = await run();
    }
    text = text.trim();
    return { text: /^\[no speech\]$/i.test(text) ? "" : text };
  });

export const createLectureNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        transcript: z.string().max(400_000).nullable().optional(),
        audio: z.string().min(100).max(20_000_000).nullable().optional(),
        mimeType: z.string().max(120).nullable().optional(),
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
    let transcript = (data.transcript ?? "").trim();
    const fatal = (e: unknown) => e instanceof Error && /free limit|API key|did not allow/i.test(e.message);
    let ai: LectureAi;

    if (data.audio) {
      // One single pass: listen, isolate the professor, transcribe and write notes together.
      const mime = /^(audio|video)\/[\w.+-]+$/.test((data.mimeType ?? "").split(";")[0]!) ? data.mimeType!.split(";")[0]! : "audio/wav";
      const prompt = `${PROMPT}\n\nMAIN SPEAKER ONLY: ${TRANSCRIBE_PROMPT.split("FOCUS ON THE MAIN SPEAKER ONLY:")[1]!.split("Return ONLY")[0]!.trim()}`;
      const ask = () =>
        withUserAiKey(context.supabase, context.userId, () =>
          callAI([
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "file", file: { filename: data.fileName || "lecture", file_data: `data:${mime};base64,${data.audio}` } },
              ],
            },
          ], { maxTokens: 16000, temperature: 0.2 }),
        );
      let raw = "";
      try {
        raw = await ask();
      } catch (e) {
        if (fatal(e)) throw e;
        raw = await ask();
      }
      try {
        ai = parseJsonBlock<LectureAi>(raw);
      } catch {
        ai = { transcript: raw.replace(/[{}"[\]]/g, " ").trim(), summary: "Notes couldn't be fully written this time, but your transcript is saved below.", key_concepts: [], flashcards: [] };
      }
      transcript = (ai.transcript ?? "").trim();
      if (!transcript) throw new Error("We couldn't hear the professor in that recording. Try keeping the phone closer to the front.");
    } else {
      if (!transcript) throw new Error("We couldn't hear any speech in that recording.");
      const notesPrompt = `${PROMPT.replace('"clean full transcript (remove filler words like um/uh, keep ALL content, keep speaker changes as new paragraphs)"', '"" (leave empty — the transcript is already saved)')}\n\nThe recording has already been transcribed (main speaker only). Work from this TRANSCRIPT:\n\n${transcript.slice(0, 200_000)}`;
      const ask = () =>
        withUserAiKey(context.supabase, context.userId, () =>
          callAI([{ role: "user", content: notesPrompt }], { maxTokens: 12000, temperature: 0.2 }),
        );
      try {
        ai = parseJsonBlock<LectureAi>(await ask());
      } catch (e) {
        if (fatal(e)) throw e;
        ai = { summary: "Notes couldn't be written this time, but your full transcript is saved below.", key_concepts: [], flashcards: [] };
      }
    }
    ai.transcript = transcript;

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
