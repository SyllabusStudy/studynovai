import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildClassContext,
  callAI,
  extractTextFromFile,
  parseJsonBlock,
  tutorSystemPrompt,
} from "./ai.server";

type DB = SupabaseClient<Database>;

/* ------------------------------------------------------------------ documents */

export async function runDocumentExtraction(supabase: DB, userId: string, documentId: string) {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();
  if (error || !doc) throw new Error("Document not found.");

  await supabase.from("documents").update({ processing_status: "processing" }).eq("id", doc.id);

  try {
    const { data: file, error: dlError } = await supabase.storage
      .from("course-materials")
      .download(doc.storage_path);
    if (dlError || !file) throw new Error("Could not download the file from storage.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text, note } = await extractTextFromFile({
      fileName: doc.file_name,
      mimeType: doc.file_type ?? file.type,
      bytes,
    });

    await supabase
      .from("documents")
      .update({
        extracted_text: text || null,
        processing_status: text ? "ready" : "unsupported",
        processing_error: note ?? null,
      })
      .eq("id", doc.id);

    return { characters: text.length, note: note ?? null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("documents")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", doc.id);
    throw new Error(message);
  }
}

/* ------------------------------------------------------------------ syllabus */

type SyllabusResult = {
  course_name: string | null;
  course_code: string | null;
  professor: string | null;
  professor_email: string | null;
  office_hours: string | null;
  attendance_policy: string | null;
  late_work_policy: string | null;
  makeup_policy: string | null;
  required_materials: string | null;
  grading_breakdown: Array<{ name: string; weight: number }>;
  dates: Array<{
    title: string;
    date: string;
    type: "exam" | "quiz" | "assignment" | "project" | "presentation" | "final" | "other";
    description?: string | null;
  }>;
  other_policies: string | null;
};

export async function runSyllabusAnalysis(supabase: DB, userId: string, documentId: string) {
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();
  if (!doc) throw new Error("Document not found.");
  if (!doc.extracted_text) throw new Error("This document has no readable text yet.");

  const today = new Date().toISOString().slice(0, 10);
  const raw = await callAI([
    {
      role: "system",
      content:
        "You extract structured data from a college syllabus and reply with json only. Use null for anything that is genuinely not stated in the syllabus — never guess or invent policies, dates or weights. Dates must be ISO YYYY-MM-DD; infer the year from the syllabus term when possible, otherwise use the upcoming occurrence relative to today.",
    },
    {
      role: "user",
      content: `Today is ${today}. Extract this json shape:
{"course_name":string|null,"course_code":string|null,"professor":string|null,"professor_email":string|null,"office_hours":string|null,"attendance_policy":string|null,"late_work_policy":string|null,"makeup_policy":string|null,"required_materials":string|null,"other_policies":string|null,"grading_breakdown":[{"name":string,"weight":number}],"dates":[{"title":string,"date":"YYYY-MM-DD","type":"exam"|"quiz"|"assignment"|"project"|"presentation"|"final"|"other","description":string|null}]}

SYLLABUS TEXT:
${doc.extracted_text.slice(0, 60000)}`,
    },
  ]);

  const parsed = parseJsonBlock<SyllabusResult>(raw);

  await supabase
    .from("documents")
    .update({ is_syllabus: true, syllabus_data: parsed as never })
    .eq("id", doc.id);

  // No class yet? Build one straight from the syllabus (matching an existing class if we can).
  let createdClass: { id: string; class_name: string } | null = null;
  if (!doc.class_id) {
    const name = parsed.course_name ?? parsed.course_code ?? doc.file_name.replace(/\.[^.]+$/, "");
    const { data: existingClasses } = await supabase
      .from("classes")
      .select("id,class_name,course_code")
      .eq("user_id", userId);
    const match = (existingClasses ?? []).find(
      (c) =>
        (parsed.course_code &&
          c.course_code &&
          c.course_code.replace(/\s+/g, "").toLowerCase() ===
            parsed.course_code.replace(/\s+/g, "").toLowerCase()) ||
        c.class_name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (match) {
      doc.class_id = match.id;
    } else {
      const palette = ["teal", "blue", "indigo", "emerald", "amber", "orange", "rose", "slate"];
      const color = palette[(existingClasses?.length ?? 0) % palette.length]!;
      const { data: inserted, error: classError } = await supabase
        .from("classes")
        .insert({
          user_id: userId,
          class_name: name,
          course_code: parsed.course_code,
          professor: parsed.professor,
          color,
        })
        .select("id,class_name")
        .single();
      if (classError || !inserted) throw new Error(classError?.message ?? "Could not create the class.");
      doc.class_id = inserted.id;
      createdClass = inserted;
    }
    await supabase.from("documents").update({ class_id: doc.class_id }).eq("id", doc.id);
  }

  let eventsCreated = 0;
  if (doc.class_id) {
    const patch: Record<string, string | null> = {};
    if (parsed.professor) patch["professor"] = parsed.professor;
    if (parsed.professor_email) patch["professor_email"] = parsed.professor_email;
    if (parsed.office_hours) patch["office_hours"] = parsed.office_hours;
    if (parsed.attendance_policy) patch["attendance_policy"] = parsed.attendance_policy;
    if (parsed.late_work_policy) patch["late_work_policy"] = parsed.late_work_policy;
    if (parsed.makeup_policy) patch["makeup_policy"] = parsed.makeup_policy;
    if (parsed.required_materials) patch["required_materials"] = parsed.required_materials;
    if (Object.keys(patch).length) {
      await supabase
        .from("classes")
        .update(patch as never)
        .eq("id", doc.class_id)
        .eq("user_id", userId);
    }

    if (Array.isArray(parsed.grading_breakdown) && parsed.grading_breakdown.length) {
      await supabase.from("grade_categories").delete().eq("class_id", doc.class_id).eq("user_id", userId);
      await supabase.from("grade_categories").insert(
        parsed.grading_breakdown
          .filter((g) => g?.name)
          .map((g) => ({
            user_id: userId,
            class_id: doc.class_id!,
            name: g.name,
            weight: Number(g.weight) || 0,
          })),
      );
    }

    const valid = (parsed.dates ?? []).filter((d) => d?.title && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    if (valid.length) {
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("title,event_date")
        .eq("user_id", userId)
        .eq("class_id", doc.class_id);
      const seen = new Set((existing ?? []).map((e) => `${e.title}|${e.event_date}`));
      const rows = valid
        .filter((d) => !seen.has(`${d.title}|${d.date}`))
        .map((d) => ({
          user_id: userId,
          class_id: doc.class_id!,
          title: d.title,
          event_type: d.type ?? "other",
          event_date: d.date,
          description: d.description ?? null,
          source_document: doc.id,
        }));
      if (rows.length) {
        const { error } = await supabase.from("calendar_events").insert(rows);
        if (!error) eventsCreated = rows.length;
      }

      const assignmentRows = valid
        .filter((d) => ["assignment", "project", "presentation"].includes(d.type))
        .map((d) => ({
          user_id: userId,
          class_id: doc.class_id!,
          title: d.title,
          due_date: d.date,
          description: d.description ?? null,
          status: "not_started",
          priority: "medium",
        }));
      if (assignmentRows.length) {
        const { data: existingA } = await supabase
          .from("assignments")
          .select("title,due_date")
          .eq("user_id", userId)
          .eq("class_id", doc.class_id);
        const seenA = new Set((existingA ?? []).map((a) => `${a.title}|${a.due_date}`));
        const fresh = assignmentRows.filter((a) => !seenA.has(`${a.title}|${a.due_date}`));
        if (fresh.length) await supabase.from("assignments").insert(fresh);
      }
    }
  }

  return { syllabus: parsed, eventsCreated, classId: doc.class_id, createdClass };
}

/* ------------------------------------------------------------------ tutor */

export type TutorMessage = { role: "user" | "assistant"; content: string; at?: string };

export async function runTutorChat(
  supabase: DB,
  userId: string,
  input: {
    conversationId?: string | null | undefined;
    classId?: string | null | undefined;
    mode: string;
    message: string;
  },
) {
  const { contextText } = await buildClassContext(supabase, userId, input.classId ?? null);

  let history: TutorMessage[] = [];
  let conversationId = input.conversationId ?? null;

  if (conversationId) {
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id,messages")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();
    if (conv) history = (conv.messages as TutorMessage[] | null) ?? [];
    else conversationId = null;
  }

  const reply = await callAI([
    { role: "system", content: tutorSystemPrompt(input.mode, contextText) },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.message },
  ]);

  const now = new Date().toISOString();
  const messages: TutorMessage[] = [
    ...history,
    { role: "user", content: input.message, at: now },
    { role: "assistant", content: reply, at: now },
  ];

  if (conversationId) {
    await supabase
      .from("ai_conversations")
      .update({ messages: messages as never, study_mode: input.mode })
      .eq("id", conversationId)
      .eq("user_id", userId);
  } else {
    const title = input.message.slice(0, 60);
    const { data: created } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: userId,
        class_id: input.classId ?? null,
        title,
        study_mode: input.mode,
        messages: messages as never,
      })
      .select("id")
      .single();
    conversationId = created?.id ?? null;
  }

  return { reply, conversationId, messages };
}

/* ------------------------------------------------------------------ flashcards */

export async function runFlashcardGeneration(
  supabase: DB,
  userId: string,
  input: {
    classId: string;
    documentId?: string | null | undefined;
    count: number;
    difficulty: string;
    topic?: string | null | undefined;
  },
) {
  const source = await sourceText(supabase, userId, input.classId, input.documentId ?? null);
  if (!source) throw new Error("Upload a readable document for this class first.");

  const raw = await callAI([
    {
      role: "system",
      content:
        "You create high-quality college study flashcards from the student's own course material and reply with json only.",
    },
    {
      role: "user",
      content: `Create exactly ${input.count} ${input.difficulty} flashcards${input.topic ? ` focused on: ${input.topic}` : ""} from the material below. Fronts are short prompts/questions, backs are precise answers (1-3 sentences). Only use facts present in the material.
Return json: {"cards":[{"front":string,"back":string,"topic":string}]}

MATERIAL:
${source.slice(0, 45000)}`,
    },
  ]);

  const parsed = parseJsonBlock<{ cards: Array<{ front: string; back: string; topic?: string }> }>(raw);
  const rows = (parsed.cards ?? [])
    .filter((c) => c?.front && c?.back)
    .slice(0, input.count)
    .map((c) => ({
      user_id: userId,
      class_id: input.classId,
      front: c.front,
      back: c.back,
      topic: c.topic ?? input.topic ?? null,
      difficulty: input.difficulty === "exam" ? "hard" : input.difficulty,
      next_review: new Date().toISOString().slice(0, 10),
    }));
  if (!rows.length) throw new Error("The AI could not build flashcards from this material.");

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length };
}

/* ------------------------------------------------------------------ quizzes */

export type QuizQuestion = {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer" | "problem";
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  topic: string;
};

export async function runQuizGeneration(
  supabase: DB,
  userId: string,
  input: {
    classId: string;
    documentId?: string | null | undefined;
    count: number;
    difficulty: string;
    types: string[];
    title?: string | null | undefined;
  },
) {
  const source = await sourceText(supabase, userId, input.classId, input.documentId ?? null);
  if (!source) throw new Error("Upload a readable document for this class first.");

  const raw = await callAI([
    {
      role: "system",
      content:
        "You write college quizzes from the student's own course material and reply with json only. Every answer must be verifiable from the material.",
    },
    {
      role: "user",
      content: `Write exactly ${input.count} ${input.difficulty}-difficulty questions using only these types: ${input.types.join(", ")}.
Return json: {"title":string,"questions":[{"id":string,"type":"multiple_choice"|"true_false"|"short_answer"|"problem","prompt":string,"options":string[],"answer":string,"explanation":string,"topic":string}]}
Rules: multiple_choice needs exactly 4 options and answer must match one option exactly. true_false options are ["True","False"]. short_answer and problem have an empty options array and a concise model answer.

MATERIAL:
${source.slice(0, 45000)}`,
    },
  ]);

  const parsed = parseJsonBlock<{ title?: string; questions: QuizQuestion[] }>(raw);
  const questions = (parsed.questions ?? [])
    .filter((q) => q?.prompt && q?.answer)
    .slice(0, input.count)
    .map((q, i) => ({ ...q, id: q.id || `q${i + 1}`, options: q.options ?? [] }));
  if (!questions.length) throw new Error("The AI could not build a quiz from this material.");

  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      user_id: userId,
      class_id: input.classId,
      title: input.title || parsed.title || "Practice quiz",
      difficulty: input.difficulty,
      questions: questions as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { quizId: data.id, count: questions.length };
}

export async function runShortAnswerGrading(
  input: { prompt: string; expected: string; studentAnswer: string },
) {
  const raw = await callAI([
    {
      role: "system",
      content: "You grade one short answer and reply with json only: {\"correct\":boolean,\"feedback\":string}",
    },
    {
      role: "user",
      content: `Question: ${input.prompt}\nModel answer: ${input.expected}\nStudent answer: ${input.studentAnswer}\nMark correct if the student captures the essential idea, even with different wording.`,
    },
  ]);
  return parseJsonBlock<{ correct: boolean; feedback: string }>(raw);
}

/* ------------------------------------------------------------------ coach */

export async function runStudyCoach(
  supabase: DB,
  userId: string,
  input: { minutes?: number | null | undefined; question?: string | null | undefined },
) {
  const { contextText } = await buildClassContext(supabase, userId, null);
  const today = new Date().toISOString().slice(0, 10);

  const raw = await callAI([
    {
      role: "system",
      content:
        "You are StudyMate AI's daily study coach. Reply with json only. Base every recommendation on the student's real deadlines, quiz results and materials. Never invent course facts. If the student has almost no data, say so kindly in the summary and suggest adding a class or syllabus.",
    },
    {
      role: "user",
      content: `Today is ${today}. The student has ${input.minutes ?? 60} minutes to study today.${input.question ? ` They also asked: ${input.question}` : ""}
Return json: {"summary":string,"tasks":[{"title":string,"detail":string,"minutes":number,"class":string}]}
Keep summary to 1-2 sentences. Give 2-4 tasks whose minutes add up to about the available time.

STUDENT CONTEXT:
${contextText}`,
    },
  ]);

  return parseJsonBlock<{
    summary: string;
    tasks: Array<{ title: string; detail: string; minutes: number; class: string }>;
  }>(raw);
}

export async function runStudyPlanEvents(
  supabase: DB,
  userId: string,
  input: { eventId: string },
) {
  const { data: event } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("id", input.eventId)
    .eq("user_id", userId)
    .single();
  if (!event) throw new Error("Event not found.");

  const { contextText } = await buildClassContext(supabase, userId, event.class_id);
  const today = new Date().toISOString().slice(0, 10);

  const raw = await callAI([
    {
      role: "system",
      content:
        "You build day-by-day exam study plans and reply with json only. Use only topics present in the student's materials.",
    },
    {
      role: "user",
      content: `Today is ${today}. Build a study plan of daily sessions from today until ${event.event_date} for: ${event.title}.
Return json: {"sessions":[{"date":"YYYY-MM-DD","title":string,"description":string}]}
One session per day, max 7 sessions, last day should be light review.

STUDENT CONTEXT:
${contextText}`,
    },
  ]);

  const parsed = parseJsonBlock<{ sessions: Array<{ date: string; title: string; description: string }> }>(raw);
  const rows = (parsed.sessions ?? [])
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.title)
    .slice(0, 7)
    .map((s) => ({
      user_id: userId,
      class_id: event.class_id,
      title: s.title,
      event_type: "study_session",
      event_date: s.date,
      description: s.description ?? null,
    }));
  if (!rows.length) throw new Error("The AI could not build a study plan for this event.");
  const { error } = await supabase.from("calendar_events").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length };
}

/* ------------------------------------------------------------------ helpers */

async function sourceText(
  supabase: DB,
  userId: string,
  classId: string,
  documentId: string | null,
): Promise<string> {
  let query = supabase
    .from("documents")
    .select("file_name,extracted_text")
    .eq("user_id", userId)
    .eq("class_id", classId)
    .not("extracted_text", "is", null);
  if (documentId) query = query.eq("id", documentId);
  const { data } = await query;
  return (data ?? [])
    .map((d) => `### ${d.file_name}\n${(d.extracted_text ?? "").slice(0, 20000)}`)
    .join("\n\n");
}
