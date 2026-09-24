import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildClassContext,
  bytesToBase64,
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
  policies: Array<{ title: string; details: string }>;
  dates: Array<{
    title: string;
    date: string;
    time?: string | null;
    type: "exam" | "quiz" | "assignment" | "project" | "presentation" | "final" | "other";
    description?: string | null;
    /** "weekly" | "biweekly" | "daily" | "monthly" — set when the syllabus says it repeats. */
    repeat?: string | null;
    /** Weekday names the item repeats on, e.g. ["saturday"] or ["monday","wednesday"]. */
    repeat_days?: string[] | null;
    /** Last date the repetition applies to (usually the end of the term). */
    repeat_until?: string | null;
  }>;
  term_start_date?: string | null;
  term_end_date?: string | null;
  other_policies: string | null;
};

type SyllabusDate = SyllabusResult["dates"][number];
type SyllabusPolicy = SyllabusResult["policies"][number];

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/**
 * Keeps one calendar entry per syllabus date. Recurring wording ("every week",
 * "every Saturday") is kept as a single dated entry instead of a repeated series.
 */
function expandRecurringDates(dates: SyllabusDate[], _today: string, _termEnd?: string | null): SyllabusDate[] {
  const out: SyllabusDate[] = [];
  const seen = new Set<string>();
  for (const item of dates) {
    if (!item?.title || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) continue;
    const key = `${String(item.title).trim().toLowerCase()}|${item.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, repeat: null, repeat_days: null, repeat_until: null });
  }
  return out;
}



const POLICY_RULES = [
  "COMPLETENESS IS THE MOST IMPORTANT THING for policies. Capture EVERY rule, requirement, expectation or procedure stated anywhere in the syllabus — do not summarize or merge them.",
  "Typical policy topics to look for (include any others you find): attendance, tardiness, participation, late work, extensions, make-up work, missed exams, grading scale, rounding, extra credit, curve, dropped grades, homework submission format, exam rules, proctoring, calculators/notes allowed, academic integrity/plagiarism/AI use, phones and laptops, classroom conduct, communication and email response time, office hours, tutoring/help resources, required materials and textbooks, accessibility/disability accommodations, Title IX, religious observance, withdrawal/drop rules, incomplete grades, technology requirements, lab safety, group work rules, recording lectures, syllabus change clause.",
  "Each policy entry: a short title (2-5 words) and details that quote or closely paraphrase the syllabus wording, keeping every specific number, deadline, penalty, percentage and exception.",
  "If a policy has multiple parts (e.g. 3 late-work tiers), keep all parts in the details.",
  "Never invent a policy that is not in the text.",
].join("\n");



const DATE_RULES = [
  "COMPLETENESS IS THE MOST IMPORTANT THING. Extract EVERY dated item in the syllabus, with no exceptions and no summarizing:",
  "- exams, midterms, finals, quizzes, tests",
  "- homework, problem sets, labs, papers, essays, projects, presentations, discussion posts, reading responses",
  "- readings or chapters tied to a specific date, and weekly schedule / course-calendar rows",
  "- drop deadlines, withdrawal deadlines, holidays, no-class days, review sessions, field trips, guest lectures",
  "Walk the syllabus top to bottom, including tables, week-by-week schedules, appendices and footnotes. If a schedule table has 15 rows, return 15 dated items.",
  "If a row lists several items for one date (e.g. 'Quiz 3 + HW 5 due'), return them as SEPARATE entries.",
  "Include a time in 24h HH:MM when the syllabus states one (e.g. 'due by 11:59pm' -> \"23:59\"), otherwise null.",
  "RECURRING ITEMS: when something happens on a repeating schedule (\"every week\", \"weekly quiz\", \"every Saturday\", \"Mondays and Wednesdays\", \"every other Friday\", \"daily reading\"), return ONE entry whose date is the FIRST occurrence, and set repeat to \"weekly\" | \"biweekly\" | \"daily\" | \"monthly\", repeat_days to the weekday names it lands on (e.g. [\"saturday\"] or [\"monday\",\"wednesday\"]), and repeat_until to the last date it applies (usually the end of the term) or null.",
  "For non-repeating items set repeat, repeat_days and repeat_until to null.",
  "Only skip an item if it truly has no identifiable date.",
].join("\n");



export async function runSyllabusAnalysis(supabase: DB, userId: string, documentId: string) {
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();
  if (!doc) throw new Error("Document not found.");
  if (!doc.extracted_text)
    throw new Error(
      doc.processing_error ??
        "We couldn't read any text out of that syllabus. If it's a scanned PDF, try a clearer scan or a photo of each page.",
    );


  const today = new Date().toISOString().slice(0, 10);
  const syllabusText = doc.extracted_text.slice(0, 60000);
  // Full extraction, free-tier friendly: one main pass over the whole syllabus,
  // plus at most two combined follow-up sweeps (dates AND policies in the same
  // call) for long syllabi where a single response would truncate.
  const swept: SyllabusDate[] = [];
  const sweptPolicies: SyllabusPolicy[] = [];

  const raw = await callAI(
    [
      {
        role: "system",
        content:
          "You extract structured data from a college syllabus and reply with json only. Use null for anything that is genuinely not stated in the syllabus — never guess or invent policies, dates or weights. Dates must be ISO YYYY-MM-DD; infer the year from the syllabus term when possible, otherwise use the upcoming occurrence relative to today.",
      },
      {
        role: "user",
        content: `Today is ${today}. Extract this json shape:
{"course_name":string|null,"course_code":string|null,"professor":string|null,"professor_email":string|null,"office_hours":string|null,"attendance_policy":string|null,"late_work_policy":string|null,"makeup_policy":string|null,"required_materials":string|null,"other_policies":string|null,"term_start_date":"YYYY-MM-DD"|null,"term_end_date":"YYYY-MM-DD"|null,"policies":[{"title":string,"details":string}],"grading_breakdown":[{"name":string,"weight":number}],"dates":[{"title":string,"date":"YYYY-MM-DD","time":"HH:MM"|null,"type":"exam"|"quiz"|"assignment"|"project"|"presentation"|"final"|"other","description":string|null,"repeat":"weekly"|"biweekly"|"daily"|"monthly"|null,"repeat_days":string[]|null,"repeat_until":"YYYY-MM-DD"|null}]}

${DATE_RULES}

${POLICY_RULES}

SYLLABUS TEXT:
${syllabusText}`,
      },
    ],
    { maxTokens: 12000, temperature: 0 },
  );

  const parsed = parseJsonBlock<SyllabusResult>(raw);

  // Long syllabi only: sweep the parts past the first ~20k characters so nothing
  // in late schedule tables or policy appendices is lost. Sequential and capped
  // at two extra calls, so free-tier rate limits are respected.
  if (syllabusText.length > 20000) {
    const rest = syllabusText.slice(20000);
    const chunkSize = 20000;
    for (let i = 0, calls = 0; i < rest.length && calls < 2; i += chunkSize, calls++) {
      const chunk = rest.slice(i, i + chunkSize);
      try {
        const sweepRaw = await callAI(
          [
            {
              role: "system",
              content:
                "You are a meticulous syllabus extractor. Reply with json only. Never invent dates or policies. Dates must be ISO YYYY-MM-DD.",
            },
            {
              role: "user",
              content: `Today is ${today}.\n${DATE_RULES}\n\n${POLICY_RULES}\n\nReply with exactly: {"dates":[{"title":string,"date":"YYYY-MM-DD","time":"HH:MM"|null,"type":"exam"|"quiz"|"assignment"|"project"|"presentation"|"final"|"other","description":string|null,"repeat":null,"repeat_days":null,"repeat_until":null}],"policies":[{"title":string,"details":string}]}\n\nSYLLABUS TEXT (later part):\n${chunk}`,
            },
          ],
          { maxTokens: 8000, temperature: 0 },
        );
        const sweepParsed = parseJsonBlock<{
          dates?: SyllabusDate[];
          policies?: SyllabusPolicy[];
        }>(sweepRaw);
        swept.push(...(sweepParsed.dates ?? []));
        sweptPolicies.push(...(sweepParsed.policies ?? []));
      } catch {
        break;
      }
    }
  }


  // Merge both passes so nothing the first pass skipped or truncated is lost.
  const mergedDates: SyllabusDate[] = [];
  const dateKeys = new Set<string>();
  for (const d of [...(parsed.dates ?? []), ...swept]) {
    if (!d?.title || !d?.date) continue;
    const key = `${String(d.title).trim().toLowerCase()}|${d.date}`;
    if (dateKeys.has(key)) continue;
    dateKeys.add(key);
    mergedDates.push(d);
  }
  parsed.dates = expandRecurringDates(mergedDates, today, parsed.term_end_date ?? null);

  const mergedPolicies: SyllabusPolicy[] = [];
  const policyKeys = new Set<string>();
  for (const p of [...(parsed.policies ?? []), ...sweptPolicies]) {
    if (!p?.title || !p?.details) continue;
    const title = String(p.title).trim();
    const details = String(p.details).trim();
    const key = `${title.toLowerCase()}|${details.slice(0, 80).toLowerCase()}`;
    if (policyKeys.has(key)) continue;
    // Same topic already captured with the same or longer wording? Keep the longer one.
    const sameTitle = mergedPolicies.find((m) => m.title.toLowerCase() === title.toLowerCase());
    if (sameTitle) {
      if (details.length > sameTitle.details.length) sameTitle.details = details;
      continue;
    }
    policyKeys.add(key);
    mergedPolicies.push({ title, details });
  }
  parsed.policies = mergedPolicies;





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
      const seen = new Set(
        (existing ?? []).map((e) => `${String(e.title).trim().toLowerCase()}|${e.event_date}`),
      );
      const rows = valid
        .filter((d) => !seen.has(`${String(d.title).trim().toLowerCase()}|${d.date}`))
        .map((d) => ({
          user_id: userId,
          class_id: doc.class_id!,
          title: d.title,
          event_type: d.type ?? "other",
          event_date: d.date,
          event_time: /^\d{2}:\d{2}$/.test(String(d.time ?? "")) ? `${d.time}:00` : null,
          description: d.description ?? null,
          source_document: doc.id,
        }));

      if (rows.length) {
        const { error } = await supabase.from("calendar_events").insert(rows);
        if (error) throw new Error(`Could not add the syllabus dates to your calendar: ${error.message}`);
        eventsCreated = rows.length;
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
      Array.isArray(parsed.policies) && parsed.policies.length
        ? `Full policy list: ${parsed.policies.map((p) => `${p.title}: ${p.details}`).join(" | ")}`
        : "",

    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 6000);
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
  if (!source) throw new Error("Upload notes, a study guide or an assignment for this class first — syllabi are not used as study material.");

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
    documentIds?: string[] | null | undefined;
    count: number;
    difficulty: string;
    types: string[];
    title?: string | null | undefined;
  },
) {
  const picked = (input.documentIds ?? []).filter(Boolean);
  if (!picked.length && input.documentId) picked.push(input.documentId);
  const source = await sourceText(supabase, userId, input.classId, picked);
  if (!source) throw new Error("Upload notes, a study guide or an assignment for this class first — syllabi are not used as study material.");

  // A short list of recent questions is enough to keep the next quiz fresh
  // without slowing the request down.
  const { data: previous } = await supabase
    .from("quizzes")
    .select("questions")
    .eq("user_id", userId)
    .eq("class_id", input.classId)
    .order("created_at", { ascending: false })
    .limit(3);
  const asked = (previous ?? [])
    .flatMap((q) => ((q.questions as unknown as QuizQuestion[]) ?? []))
    .map((q) => q?.prompt)
    .filter((p): p is string => Boolean(p))
    .slice(0, 40);

  const angles = [
    "definitions and key terms",
    "applying ideas to new scenarios",
    "comparing and contrasting concepts",
    "cause and effect / why questions",
    "worked problems and calculations",
    "common mistakes and misconceptions",
    "connecting two different sections of the material",
  ];
  const focus = angles.sort(() => Math.random() - 0.5).slice(0, 3).join("; ");
  const difficultyGuide: Record<string, string> = {
    easy:
      "Test accurate recall and basic understanding. Use direct wording, but do not copy sentences from the material.",
    medium:
      "Test understanding plus application. At least half the questions must require applying, comparing, explaining, or connecting ideas rather than simple recall.",
    hard:
      "Write demanding college-level questions. At least 70% must require multi-step reasoning, analysis of a new scenario, comparison across concepts, error diagnosis, or selecting the best justification. Avoid pure definition questions unless they are part of a larger reasoning task.",
    exam:
      "Match a rigorous college exam. At least 80% must require synthesis across sections, multi-step application, interpreting evidence or calculations, evaluating a claim, or diagnosing a realistic misconception. Include subtle but fair distinctions and no trivia.",
  };
  const challenge = difficultyGuide[input.difficulty] ?? difficultyGuide["medium"];

  const raw = await callAI(
    [
      {
        role: "system",
        content:
          "You are an expert college assessment writer. Build fair, rigorous quizzes from the student's own material. Reply with json only, no preamble. Never reuse a question the student already saw. Difficulty must change the depth of thinking, not merely use harder vocabulary.",
      },
      {
        role: "user",
        content: `Write exactly ${input.count} ${input.difficulty}-difficulty questions using only these types: ${input.types.join(", ")}.
Return json: {"title":string,"questions":[{"id":string,"type":"multiple_choice"|"true_false"|"short_answer"|"problem","prompt":string,"options":string[],"answer":string,"explanation":string,"topic":string}]}
Rules: multiple_choice needs exactly 4 options and answer must match one option exactly. true_false options are ["True","False"]. short_answer and problem have an empty options array and a concise model answer. Explanations: one short sentence.
Difficulty standard: ${challenge}
Quality rules:
- Each question must test a different fact, skill, relationship, or reasoning path and spread coverage across the material.
- For multiple choice, write one clearly best answer and three plausible distractors based on likely student mistakes. Do not use joke answers, "all/none of the above," or clues from option length.
- Vary the correct option position across the quiz. Do not make the answer obvious by repeating words from the prompt.
- Scenarios and problems must contain enough information to solve from the supplied material; never invent a required fact.
- Prefer these angles for this quiz: ${focus}.
${asked.length ? `Do not repeat these:\n${asked.map((p) => `- ${p}`).join("\n").slice(0, 1500)}` : ""}

MATERIAL:
${source.slice(0, 14000)}`,
      },
    ],
    { temperature: 0.9, maxTokens: Math.min(1200 + input.count * 220, 8000) },
  );



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
  documentId: string | string[] | null,
): Promise<string> {
  const ids = Array.isArray(documentId) ? documentId.filter(Boolean) : documentId ? [documentId] : [];
  let query = supabase
    .from("documents")
    .select("file_name,extracted_text")
    .eq("user_id", userId)
    .eq("class_id", classId)
    .not("extracted_text", "is", null);
  // Syllabi are schedules/policies, not study material — skip them unless the
  // student explicitly picked those documents.
  if (ids.length) query = query.in("id", ids);
  else query = query.eq("is_syllabus", false);
  const { data } = await query;
  // Share the budget across everything the student picked.
  const per = Math.max(1500, Math.floor(14000 / Math.max(1, (data ?? []).length)));
  return (data ?? [])
    .map((d) => `### ${d.file_name}\n${(d.extracted_text ?? "").slice(0, per)}`)
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

/* ------------------------------------------------------------------ file mark-up */

export type DocMarker = {
  n: number;
  label: string;
  note: string;
  quote?: string | null;
  /** 1-based page the box belongs to (PDFs); 1 for images. */
  page?: number;
  /** Normalized 0-1 box on that page/image. */
  box?: { x: number; y: number; w: number; h: number } | null;
};


const MARKUP_RULES = [
  "You mark up a student's assignment file so they can see exactly what each part is asking.",
  "Find every question, problem, instruction, key term, due date, point value or trap on the page.",
  "For each one give a very short label (max 6 words) and a one or two sentence plain note that explains what it means or what to do.",
  "\n",
  PLAIN_STYLE,
].join(" ");

/** Asks the AI to point out and mark specific spots in an uploaded assignment file. */
export async function runDocumentMarkup(
  supabase: DB,
  userId: string,
  input: { documentId: string; pageImages?: string[] | null | undefined },
) {
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", input.documentId)
    .eq("user_id", userId)
    .single();
  if (!doc) throw new Error("File not found.");

  const pageImages = (input.pageImages ?? []).filter((s) => s.startsWith("data:image/")).slice(0, 3);

  let content: Array<Record<string, unknown>>;
  let schema: string;

  if (pageImages.length) {
    // PDF rendered to page images in the browser, so boxes can be drawn on it.
    schema = `Return ONLY JSON: {"markers":[{"label":"...","note":"...","page":1,"box":{"x":0.12,"y":0.30,"w":0.40,"h":0.08}}]}
page is which page image the marker is on (1 = first image given). box is the region on that page, as fractions of its width/height from the top-left corner. Be accurate: the box must sit exactly over the text or figure you describe.`;
    content = [
      {
        type: "text",
        text: `Mark up these ${pageImages.length} page(s) of the file. Give 4 to 12 markers, in reading order.\n${schema}`,
      },
      ...pageImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ];
  } else {
    const mime = doc.file_type ?? "";
    const { data: file, error: dlError } = await supabase.storage
      .from("course-materials")
      .download(doc.storage_path);
    if (dlError || !file) throw new Error("Could not open that file.");
    const type = mime || file.type || "";
    const isImage = type.startsWith("image/");
    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

    schema = isImage
      ? `Return ONLY JSON: {"markers":[{"label":"...","note":"...","box":{"x":0.12,"y":0.30,"w":0.40,"h":0.08}}]}
box is the region on the image, as fractions of the width/height from the top-left corner. Be accurate: the box must sit over the exact text or figure you are describing.`
      : `Return ONLY JSON: {"markers":[{"label":"...","note":"...","quote":"the exact short phrase from the document"}]}`;

    content = [
      { type: "text", text: `Mark up this file. Give 4 to 12 markers, in reading order.\n${schema}` },
      isImage
        ? { type: "image_url" as const, image_url: { url: `data:${type};base64,${base64}` } }
        : {
            type: "file" as const,
            file: { filename: doc.file_name, file_data: `data:application/pdf;base64,${base64}` },
          },
    ];
  }

  const raw = await callAI(
    [
      { role: "system", content: MARKUP_RULES },
      { role: "user", content: content as never },
    ],
    { maxTokens: 2200 },
  );


  const parsed = parseJsonBlock<{ markers?: Array<Omit<DocMarker, "n">> }>(raw);
  const markers: DocMarker[] = (parsed.markers ?? [])
    .filter((m) => m && typeof m.label === "string")
    .slice(0, 14)
    .map((m, i) => ({
      n: i + 1,
      label: String(m.label).slice(0, 60),
      note: String(m.note ?? "").slice(0, 400),
      quote: m.quote ? String(m.quote).slice(0, 200) : null,
      page: typeof m.page === "number" && m.page >= 1 ? Math.min(Math.round(m.page), 3) : 1,

      box:
        m.box && [m.box.x, m.box.y, m.box.w, m.box.h].every((v) => typeof v === "number")
          ? {
              x: Math.min(Math.max(m.box.x, 0), 1),
              y: Math.min(Math.max(m.box.y, 0), 1),
              w: Math.min(Math.max(m.box.w, 0.02), 1),
              h: Math.min(Math.max(m.box.h, 0.02), 1),
            }
          : null,
    }));

  if (!markers.length) throw new Error("The AI could not find anything to mark on this file.");

  await supabase
    .from("documents")
    .update({ annotations: markers })
    .eq("id", doc.id)
    .eq("user_id", userId);

  return { markers };
}
