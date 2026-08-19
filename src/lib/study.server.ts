import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildClassContext,
  callAI,
  extractTextFromFile,
  parseJsonBlock,
  PLAIN_STYLE,
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

    // Class memory: a follow-up upload (chapter 4 study guide, notes, homework)
    // gets attached to the class it clearly belongs to, so the student never has
    // to re-explain which course they mean.
    let linkedClass: { id: string; class_name: string } | null = null;
    if (text && !doc.class_id && !doc.is_syllabus) {
      linkedClass = await inferDocumentClass(supabase, userId, doc.id, doc.file_name, text);
    }

    return { characters: text.length, note: note ?? null, linkedClass };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("documents")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", doc.id);
    throw new Error(message);
  }
}

/** Picks the student's existing class that a new document belongs to and links it. */
async function inferDocumentClass(
  supabase: DB,
  userId: string,
  documentId: string,
  fileName: string,
  text: string,
): Promise<{ id: string; class_name: string } | null> {
  const { data: classes } = await supabase
    .from("classes")
    .select("id,class_name,course_code,professor")
    .eq("user_id", userId);
  if (!classes?.length) return null;

  let chosen: (typeof classes)[number] | undefined;
  if (classes.length === 1) {
    chosen = classes[0];
  } else {
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            'You match a student document to one of their college classes and reply with json only: {"class_id":string|null}. Use null only when the document clearly belongs to none of them.',
        },
        {
          role: "user",
          content: `CLASSES:
${classes.map((c) => `- id ${c.id}: ${c.course_code ? c.course_code + " " : ""}${c.class_name}${c.professor ? ` (prof ${c.professor})` : ""}`).join("\n")}

DOCUMENT FILE NAME: ${fileName}
DOCUMENT TEXT (start):
${text.slice(0, 4000)}`,
        },
      ],
      { maxTokens: 120 },
    );
    try {
      const parsed = parseJsonBlock<{ class_id: string | null }>(raw);
      chosen = classes.find((c) => c.id === parsed.class_id);
    } catch {
      chosen = undefined;
    }
  }
  if (!chosen) return null;

  await supabase.from("documents").update({ class_id: chosen.id }).eq("id", documentId);
  await supabase.from("ai_memory").insert({
    user_id: userId,
    class_id: chosen.id,
    kind: "context",
    content: `The document "${fileName}" belongs to ${chosen.course_code ? chosen.course_code + " " : ""}${chosen.class_name}. When the student mentions this material, assume that class without asking.`,
  });
  return { id: chosen.id, class_name: chosen.class_name };
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

  // Remember the course itself, so later uploads and chats already know the class.
  if (doc.class_id) {
    const facts = [
      `Class on file: ${parsed.course_code ? parsed.course_code + " — " : ""}${parsed.course_name ?? "unnamed course"}.`,
      parsed.professor ? `Professor: ${parsed.professor}.` : "",
      parsed.office_hours ? `Office hours: ${parsed.office_hours}.` : "",
      parsed.attendance_policy ? `Attendance policy: ${parsed.attendance_policy}` : "",
      parsed.late_work_policy ? `Late work policy: ${parsed.late_work_policy}` : "",
      parsed.makeup_policy ? `Make-up policy: ${parsed.makeup_policy}` : "",
      parsed.required_materials ? `Required materials: ${parsed.required_materials}` : "",
      Array.isArray(parsed.grading_breakdown) && parsed.grading_breakdown.length
        ? `Grade weights: ${parsed.grading_breakdown.map((g) => `${g.name} ${g.weight}%`).join(", ")}.`
        : "",
      parsed.other_policies ? `Other policies: ${parsed.other_policies}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2000);
    await supabase.from("ai_memory").insert({
      user_id: userId,
      class_id: doc.class_id,
      kind: "syllabus",
      content: facts,
    });
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

  const reply = await callAI(
    [
      { role: "system", content: tutorSystemPrompt(input.mode, contextText) },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.message },
    ],
    { maxTokens: 1200 },
  );

  const now = new Date().toISOString();
  const messages: TutorMessage[] = [
    ...history,
    { role: "user", content: input.message, at: now },
    { role: "assistant", content: reply, at: now },
  ];

  const savers: Array<PromiseLike<unknown>> = [
    // Long-term memory: one compact note per exchange, readable in every future chat.
    supabase.from("ai_memory").insert({
      user_id: userId,
      class_id: input.classId ?? null,
      kind: "chat",
      content: `Student asked: ${input.message.slice(0, 220)} | You answered: ${reply.replace(/\s+/g, " ").slice(0, 320)}`,
    }),
  ];

  if (conversationId) {
    savers.push(
      supabase
        .from("ai_conversations")
        .update({ messages: messages as never, study_mode: input.mode })
        .eq("id", conversationId)
        .eq("user_id", userId),
    );
    await Promise.all(savers);
  } else {
    const title = input.message.slice(0, 60);
    const [{ data: created }] = await Promise.all([
      supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          class_id: input.classId ?? null,
          title,
          study_mode: input.mode,
          messages: messages as never,
        })
        .select("id")
        .single(),
      ...savers,
    ]);
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
    assignmentId?: string | null | undefined;
    matchHomework?: boolean | undefined;
    deck?: string | null | undefined;
  },
) {
  const source = await sourceText(supabase, userId, input.classId, input.documentId ?? null);
  if (!source) throw new Error("Upload a readable document for this class first.");

  // Optionally aim the deck at the student's real homework / upcoming deadlines.
  let homework = "";
  let deckHint = "";
  if (input.assignmentId || input.matchHomework) {
    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from("assignments")
      .select("title,description,due_date,category,status")
      .eq("user_id", userId)
      .eq("class_id", input.classId);
    if (input.assignmentId) q = q.eq("id", input.assignmentId);
    else q = q.neq("status", "completed").gte("due_date", today).order("due_date").limit(6);
    const { data: hw } = await q;

    let events: Array<{ title: string; event_date: string; event_type: string }> = [];
    if (!input.assignmentId) {
      const { data } = await supabase
        .from("calendar_events")
        .select("title,event_date,event_type")
        .eq("user_id", userId)
        .eq("class_id", input.classId)
        .gte("event_date", today)
        .order("event_date")
        .limit(6);
      events = data ?? [];
    }

    const lines = [
      ...(hw ?? []).map(
        (a) =>
          `- Homework: ${a.title}${a.due_date ? ` (due ${a.due_date})` : ""}${a.category ? ` [${a.category}]` : ""}${a.description ? ` — ${a.description}` : ""}`,
      ),
      ...events.map((e) => `- Upcoming ${e.event_type}: ${e.title} on ${e.event_date}`),
    ];
    homework = lines.join("\n");
    if (input.assignmentId && hw?.[0]) deckHint = hw[0].title;
    if (!homework && input.assignmentId) throw new Error("That assignment could not be found.");
  }

  const raw = await callAI(
    [
      {
        role: "system",
        content:
          "You create high-quality college study flashcards from the student's own course material and reply with json only. Plain text only: no LaTeX, no $ signs, no backslash math commands. Write math like (x+2)/3, x^2, sqrt(9).",
      },
      {
        role: "user",
        content: `Create exactly ${input.count} ${input.difficulty} flashcards${input.topic ? ` focused on: ${input.topic}` : ""} from the material below. Fronts are short prompts/questions, backs are precise answers (1-2 sentences). Only use facts present in the material.
${
  homework
    ? `Prioritise the concepts, skills and problem types the student needs for this homework and these upcoming deadlines. Set each card's "topic" to the homework or deadline it supports:\n${homework}\n`
    : ""
}Return json: {"cards":[{"front":string,"back":string,"topic":string}]}

MATERIAL:
${source.slice(0, 20000)}`,
      },
    ],
    { maxTokens: 4000 },
  );

  const parsed = parseJsonBlock<{ cards: Array<{ front: string; back: string; topic?: string }> }>(raw);
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const deck =
    (input.deck ?? "").trim() ||
    `${deckHint || input.topic || (homework ? "Homework focus" : "All materials")} · ${stamp}`;

  const rows = (parsed.cards ?? [])
    .filter((c) => c?.front && c?.back)
    .slice(0, input.count)
    .map((c) => ({
      user_id: userId,
      class_id: input.classId,
      deck,
      front: c.front,
      back: c.back,
      topic: c.topic ?? input.topic ?? null,
      difficulty: input.difficulty === "exam" ? "hard" : input.difficulty,
      next_review: new Date().toISOString().slice(0, 10),
    }));
  if (!rows.length) throw new Error("The AI could not build flashcards from this material.");

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length, deck };
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
${source.slice(0, 20000)}`,
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

  const raw = await callAI(
    [
      {
        role: "system",
        content:
          "You are StudyMate AI's daily study coach. Reply with json only. Base every recommendation on the student's real deadlines, quiz results and materials. Never invent course facts. Plain text only: no LaTeX, no $ signs, no backslash math commands. If the student has almost no data, say so kindly in the summary and suggest adding a class or syllabus.",
      },
      {
        role: "user",
        content: `Today is ${today}. The student has ${input.minutes ?? 60} minutes to study today.${input.question ? ` They also asked: ${input.question}` : ""}
Return json: {"summary":string,"tasks":[{"title":string,"detail":string,"minutes":number,"class":string}]}
Keep summary to 1-2 sentences. Give 2-4 tasks whose minutes add up to about the available time.

STUDENT CONTEXT:
${contextText.slice(0, 12000)}`,
      },
    ],
    { maxTokens: 1600 },
  );

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
    .map((d) => `### ${d.file_name}\n${(d.extracted_text ?? "").slice(0, 12000)}`)
    .join("\n\n");
}

/* ------------------------------------------------------------------ assignment help */

const HELP_RULES = [
  "You are StudyMate AI helping a college student with their own homework.",
  "Teach, don't just dump answers: identify what each question asks, then show the worked reasoning step by step and state the final answer clearly.",
  "Use markdown with a short heading per question. Flag anything you cannot read from the file instead of guessing.",
  "End with a 2-3 bullet 'What to review' list.",
  "\n",
  PLAIN_STYLE,
].join(" ");

export async function runAssignmentHelp(
  supabase: DB,
  userId: string,
  input: { assignmentId: string; question?: string | null | undefined },
) {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", input.assignmentId)
    .eq("user_id", userId)
    .single();
  if (!assignment) throw new Error("Assignment not found.");

  const { data: docs } = await supabase
    .from("documents")
    .select("id,file_name,extracted_text,processing_status")
    .eq("user_id", userId)
    .eq("assignment_id", assignment.id);

  const attached = (docs ?? []).filter((d) => (d.extracted_text ?? "").trim().length > 0);
  if (!attached.length) {
    throw new Error(
      (docs ?? []).length
        ? "Your attached file is still being read. Try again in a few seconds."
        : "Attach a PDF or screenshot of this assignment first.",
    );
  }

  const { contextText } = await buildClassContext(supabase, userId, assignment.class_id);

  const reply = await callAI([
    { role: "system", content: `${HELP_RULES}\n\nSTUDENT COURSE CONTEXT:\n${contextText.slice(0, 8000)}` },
    {
      role: "user",
      content: `Assignment: ${assignment.title}${assignment.due_date ? ` (due ${assignment.due_date})` : ""}
${assignment.description ? `Notes: ${assignment.description}` : ""}
${input.question ? `My specific question: ${input.question}` : "Walk me through the whole thing."}

ATTACHED FILES:
${attached.map((d) => `### ${d.file_name}\n${(d.extracted_text ?? "").slice(0, 12000)}`).join("\n\n")}`,
    },
  ]);

  await supabase
    .from("documents")
    .update({ ai_help: reply })
    .eq("id", attached[0]!.id)
    .eq("user_id", userId);

  return { reply };
}

/* ------------------------------------------------------------------ snapquick */

export async function runSnapHelp(
  supabase: DB,
  userId: string,
  input: { imageDataUrl: string; classId?: string | null | undefined; question?: string | null | undefined },
) {
  const { contextText } = await buildClassContext(supabase, userId, input.classId ?? null);

  const reply = await callAI([
    {
      role: "system",
      content: `${HELP_RULES} The student photographed their work with a phone camera, so read carefully and say if part of the image is blurry or cut off.\n\nSTUDENT COURSE CONTEXT:\n${contextText.slice(0, 6000)}`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Scan this photo of my work. Identify every question or problem on it, then solve and explain each one.${input.question ? ` Focus especially on: ${input.question}` : ""}`,
        },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ],
    },
  ]);

  return { reply };
}
