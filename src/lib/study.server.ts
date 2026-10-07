import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildClassContext,
  bytesToBase64,
  callAI,
  extractTextFromFile,
  OUTSIDE_LOOKUP,
  parseJsonBlock,
  PLAIN_STYLE,
  tutorSystemPrompt,
} from "./ai.server";
import type { ChatMessage } from "./ai.server";

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

    // Generic export names ("Untitled document.pdf", "Scan_01.pdf", "IMG_4821.pdf")
    // get replaced with the actual topic of the file so materials lists stay readable.
    let renamedTo: string | null = null;
    if (text && isGenericFileName(doc.file_name) && !doc.is_syllabus) {
      renamedTo = await autoNameDocument(supabase, doc.id, doc.file_name, text);
    }

    // Class memory: a follow-up upload (chapter 4 study guide, notes, homework)
    // gets attached to the class it clearly belongs to, so the student never has
    // to re-explain which course they mean.
    let linkedClass: { id: string; class_name: string } | null = null;
    if (text && !doc.class_id && !doc.is_syllabus) {
      linkedClass = await inferDocumentClass(supabase, userId, doc.id, renamedTo ?? doc.file_name, text);
    }

    return { characters: text.length, note: note ?? null, linkedClass, renamedTo };

  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("documents")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", doc.id);
    throw new Error(message);
  }
}

const GENERIC_NAME_PATTERNS = [
  /^untitled/i,
  /^document\b/i,
  /^doc\d*$/i,
  /^new document/i,
  /^copy of /i,
  /^download(\s*\(\d+\))?$/i,
  /^scan[\s._-]*\d*$/i,
  /^scanned[\s._-]/i,
  /^img[\s._-]*\d+$/i,
  /^image[\s._-]*\d*$/i,
  /^photo[\s._-]*\d*$/i,
  /^pxl[\s._-]*\d+/i,
  /^screenshot/i,
  /^file[\s._-]*\d*$/i,
  /^\d[\d\s._-]*$/,
];

/** True when a file name carries no topic (a phone scan, a Google Docs export, etc.). */
export function isGenericFileName(fileName: string): boolean {
  const base = fileName.replace(/\.[a-z0-9]{1,6}$/i, "").trim();
  if (!base) return true;
  const cleaned = base.replace(/\s*\(\d+\)$/, "").trim();
  return GENERIC_NAME_PATTERNS.some((re) => re.test(cleaned));
}

function sanitizeTitle(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/** Renames a generically named document after the topic of its content. */
async function autoNameDocument(
  supabase: DB,
  documentId: string,
  fileName: string,
  text: string,
): Promise<string | null> {
  const ext = fileName.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? "";
  try {
    const raw = await callAI(
      [
        {
          role: "system",
          content:
            'You name a student\'s course file after its actual topic and reply with json only: {"title":string}. Keep it 3-8 words, title case, no file extension, no quotes. Use the course code or chapter when the document states it. Never invent a topic — if the text has no clear topic, reply {"title":null}.',
        },
        { role: "user", content: `FILE CONTENT (start):\n${text.slice(0, 3000)}` },
      ],
      { maxTokens: 60, temperature: 0 },
    );
    const parsed = parseJsonBlock<{ title: string | null }>(raw);
    const title = sanitizeTitle(String(parsed.title ?? ""));
    if (!title || title.length < 3) return null;
    const next = `${title}${ext}`;
    const { error } = await supabase.from("documents").update({ file_name: next }).eq("id", documentId);
    if (error) return null;
    return next;
  } catch {
    return null;
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



export async function runSyllabusAnalysis(supabase: DB, userId: string, documentId: string, skipDates = false) {
  // Mark as analyzing so the Classes page can show a "building class" card even after navigation.
  await supabase.from("documents").update({ processing_status: "analyzing" }).eq("id", documentId).eq("user_id", userId);
  try {
    return await runSyllabusAnalysisInner(supabase, userId, documentId, skipDates);
  } finally {
    await supabase.from("documents").update({ processing_status: "ready" }).eq("id", documentId).eq("user_id", userId);
  }
}

async function runSyllabusAnalysisInner(supabase: DB, userId: string, documentId: string, skipDates = false) {
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

  // Run the main pass and any long-syllabus sweeps at the same time instead of
  // one after another, so long syllabi finish in roughly one AI round-trip.
  const mainText = syllabusText.length > 20000 ? syllabusText.slice(0, 20000) : syllabusText;
  const sweepChunks: string[] = [];
  if (syllabusText.length > 20000) {
    const rest = syllabusText.slice(20000);
    for (let i = 0; i < rest.length && sweepChunks.length < 2; i += 20000) sweepChunks.push(rest.slice(i, i + 20000));
  }
  const sweepPromise = Promise.all(sweepChunks.map((chunk) => runSweep(chunk).catch(() => null)));
  async function runSweep(chunk: string) {
    return callAI(
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
      { maxTokens: 6000, temperature: 0 },
    );
  }

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
${mainText}`,
      },
    ],
    { maxTokens: 8000, temperature: 0 },
  );

  const parsed = parseJsonBlock<SyllabusResult>(raw);

  for (const sweepRaw of await sweepPromise) {
    if (!sweepRaw) continue;
    try {
      const sp = parseJsonBlock<{ dates?: SyllabusDate[]; policies?: SyllabusPolicy[] }>(sweepRaw);
      swept.push(...(sp.dates ?? []));
      sweptPolicies.push(...(sp.policies ?? []));
    } catch { /* ignore a bad sweep */ }
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

  // A syllabus exported as "Untitled document.pdf" gets named after its course.
  if (isGenericFileName(doc.file_name)) {
    const label = sanitizeTitle(
      `${parsed.course_code ? parsed.course_code + " " : ""}${parsed.course_name ?? ""} Syllabus`,
    );
    if (label.length > 10) {
      const ext = doc.file_name.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? "";
      await supabase.from("documents").update({ file_name: `${label}${ext}` }).eq("id", doc.id);
    }
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

    const valid = skipDates ? [] : (parsed.dates ?? []).filter((d) => d?.title && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
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
    files?: Array<{ name: string; dataUrl: string }> | undefined;
  },
) {
  const { contextText } = await buildClassContext(supabase, userId, input.classId ?? null);
  const files = input.files ?? [];
  const userContent = files.length
    ? [
        { type: "text" as const, text: `${input.message}\n\n(The student attached: ${files.map((f) => f.name).join(", ")}. Read them carefully and use them to answer.)` },
        ...files.map((f) =>
          f.dataUrl.startsWith("data:image/")
            ? { type: "image_url" as const, image_url: { url: f.dataUrl } }
            : { type: "file" as const, file: { filename: f.name, file_data: f.dataUrl } },
        ),
      ]
    : input.message;

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
      { role: "user", content: userContent },
    ],
    { maxTokens: files.length ? 2000 : 1200, search: true },
  );

  const now = new Date().toISOString();
  const messages: TutorMessage[] = [
    ...history,
    { role: "user", content: files.length ? `${input.message}\n\n📎 ${files.map((f) => f.name).join(", ")}` : input.message, at: now },
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

/** Text of one saved video note (QuickVideo), used as study material. */
async function videoNoteText(supabase: DB, userId: string, videoNoteId: string): Promise<{ title: string; text: string }> {
  const { data } = await supabase
    .from("video_notes")
    .select("title, summary, notes, transcript")
    .eq("id", videoNoteId)
    .eq("user_id", userId)
    .single();
  if (!data) throw new Error("Those video notes could not be found.");
  const text = [
    `VIDEO NOTES: ${data.title}`,
    data.summary ? `Summary: ${data.summary}` : "",
    data.notes ?? "",
    data.transcript ? `Transcript:\n${data.transcript.slice(0, 12000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!text.trim()) throw new Error("Those video notes are empty — open them once so they finish processing, then try again.");
  return { title: data.title, text };
}

export async function runFlashcardGeneration(
  supabase: DB,
  userId: string,
  input: {
    classId: string;
    documentId?: string | null | undefined;
    videoNoteId?: string | null | undefined;
    count: number;
    difficulty: string;
    topic?: string | null | undefined;
    assignmentId?: string | null | undefined;
    matchHomework?: boolean | undefined;
    deck?: string | null | undefined;
  },
) {
  let source = "";
  let videoTitle = "";
  if (input.videoNoteId) {
    const v = await videoNoteText(supabase, userId, input.videoNoteId);
    source = v.text;
    videoTitle = v.title;
  } else {
    source = await sourceText(supabase, userId, input.classId, input.documentId ?? null);
  }
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
    `${deckHint || input.topic || (videoTitle ? videoTitle.slice(0, 60) : homework ? "Homework focus" : "All materials")} · ${stamp}`;

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
  type: "multiple_choice" | "true_false" | "short_answer" | "problem" | "image_choice" | "structure_choice";
  prompt: string;
  options?: string[];
  image_options?: { page: number; box: [number, number, number, number] }[];
  option_images?: string[];
  option_smiles?: string[];
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
    lectureIds?: string[] | null | undefined;
    noteIds?: string[] | null | undefined;
    videoNoteId?: string | null | undefined;
    count: number;
    difficulty: string;
    types: string[];
    title?: string | null | undefined;
    pageImages?: string[] | null | undefined;
  },
) {
  const pageImages = (input.pageImages ?? []).slice(0, 6);
  const picked = (input.documentIds ?? []).filter(Boolean);
  if (!picked.length && input.documentId) picked.push(input.documentId);
  const lecturePicked = (input.lectureIds ?? []).filter(Boolean);
  const notePicked = (input.noteIds ?? []).filter(Boolean);
  const videoPicked = Boolean(input.videoNoteId);
  const allMode = !picked.length && !lecturePicked.length && !notePicked.length && !videoPicked;
  const docPart = allMode || picked.length ? await sourceText(supabase, userId, input.classId, picked) : "";
  const lecturePart = allMode || lecturePicked.length ? await lectureText(supabase, userId, input.classId, lecturePicked) : "";
  if (lecturePicked.length && !lecturePart.trim())
    throw new Error("We couldn't process these lecture notes yet. Try again or upload the notes manually.");
  const notePart = allMode || notePicked.length ? await personalNoteText(supabase, userId, input.classId, notePicked) : "";
  if (notePicked.length && !notePart.trim())
    throw new Error("Those notes are empty — write a bit more, then try again.");
  const videoPart = videoPicked ? (await videoNoteText(supabase, userId, input.videoNoteId!)).text : "";
  const source = [docPart, lecturePart, notePart, videoPart].filter((s) => s.trim()).join("\n\n");
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
      (() => {
        const types = [...input.types.filter((t) => t !== "image_choice" && t !== "structure_choice"), "structure_choice"];
        const text = `Write exactly ${input.count} ${input.difficulty}-difficulty questions using only these types: ${types.join(", ")}.
Return json: {"title":string,"questions":[{"id":string,"type":"multiple_choice"|"true_false"|"short_answer"|"problem"|"structure_choice","prompt":string,"options":string[],"answer":string,"explanation":string,"topic":string,"option_smiles"?:string[]}]}
Rules: multiple_choice needs exactly 4 options and answer must match one option exactly. true_false options are ["True","False"]. short_answer and problem have an empty options array and a concise model answer. Explanations: one short sentence.
Difficulty standard: ${challenge}
Quality rules:
- Each question must test a different fact, skill, relationship, or reasoning path and spread coverage across the material.
- For multiple choice, write one clearly best answer and three plausible distractors based on likely student mistakes. Do not use joke answers, "all/none of the above," or clues from option length.
- Vary the correct option position across the quiz. Do not make the answer obvious by repeating words from the prompt.
- Scenarios and problems must contain enough information to solve from the supplied material; never invent a required fact.
- Prefer these angles for this quiz: ${focus}.
STRUCTURE QUESTIONS: only if the material involves chemistry/molecules, make about a third of the questions (at least 1) "structure_choice". The app DRAWS each option from SMILES — never use pictures from the material. For structure_choice: options must be ["A","B","C","D"], answer is the correct letter, "option_smiles" has exactly 4 valid, distinct SMILES strings in letter order (no names or labels). All 4 must be the same kind of molecule so distractors are plausible (e.g. rings of different sizes, isomers, different functional groups). The prompt must describe properties the student reasons about (ring size, bonds, functional groups, atom counts, products) and must never name the answer molecule. Double-check the correct SMILES truly matches the prompt and the explanation says why. If the material has no chemistry, do not use structure_choice.
${pageImages.length ? `${pageImages.length} page images of the material are attached for reading only.\n` : ""}${asked.length ? `Do not repeat these:\n${asked.map((p) => `- ${p}`).join("\n").slice(0, 1500)}` : ""}

MATERIAL:
${source.slice(0, 14000)}`;
        return {
          role: "user" as const,
          content: pageImages.length
            ? [{ type: "text" as const, text }, ...pageImages.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
            : text,
        };
      })(),
    ] as never,
    { temperature: 0.9, maxTokens: Math.min(3000 + input.count * 450, 20000) },
  );



  const rawParsed = parseJsonBlock<unknown>(raw) as unknown;
  const pr = (rawParsed && typeof rawParsed === "object" ? rawParsed : {}) as any;
  const list: unknown[] = Array.isArray(rawParsed)
    ? rawParsed
    : ((["questions", "quiz", "items", "data"].map((k) => pr[k]).find((v) => Array.isArray(v)) as unknown[]) ??
      (pr.quiz && typeof pr.quiz === "object" && Array.isArray((pr.quiz as any).questions)
        ? ((pr.quiz as any).questions as unknown[])
        : []));
  const parsed = { title: typeof pr.title === "string" ? pr.title : undefined };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const resolveIdx = (ans: string, candidates: string[][]) => {
    const a = ans.trim().replace(/^\(?([A-Fa-f])[).:]?\s*$/, "$1");
    const li = LETTERS.indexOf(a.toUpperCase());
    if (li >= 0 && a.length === 1) return li;
    const low = ans.trim().toLowerCase();
    for (const c of candidates) {
      const i = c.findIndex((x) => x.trim().toLowerCase() === low);
      if (i >= 0) return i;
    }
    const m = ans.trim().match(/^([A-Fa-f])[).:\s]/);
    if (m) return LETTERS.indexOf(m[1]!.toUpperCase());
    return -1;
  };
  const questions = list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as any;
      const prompt = str(r.prompt) || str(r.question) || str(r.text) || str(r.stem);
      const answer = str(r.answer) || str(r.correct_answer) || str(r.correctAnswer) || str(r.solution);
      if (!prompt || !answer) return null;
      const opts = Array.isArray(r.options) ? (r.options as unknown[]).map(str).filter(Boolean) : Array.isArray(r.choices) ? (r.choices as unknown[]).map(str).filter(Boolean) : undefined;
      return { ...(r as unknown as QuizQuestion), prompt, answer, options: opts, explanation: str(r.explanation) || undefined, type: str(r.type) || (opts && opts.length > 1 ? "multiple_choice" : "short_answer") } as QuizQuestion;
    })
    .filter((q): q is QuizQuestion => q !== null)
    .slice(0, input.count)
    .map((q, i) => {
      let options = q.options ?? [];
      const id = q.id || `q${i + 1}`;
      const asText = (): any => {
        // Fallback: keep as a normal question rather than discarding it.
        const textOpts = options.filter((o) => !/^[A-F]$/i.test(o));
        if (textOpts.length > 1) {
          const idx = resolveIdx(q.answer, [textOpts]);
          const ans = idx >= 0 ? textOpts[idx]! : q.answer;
          if (!textOpts.includes(ans)) textOpts[textOpts.length - 1] = ans;
          return { ...q, id, type: "multiple_choice", options: textOpts, option_smiles: undefined, image_options: undefined, answer: ans };
        }
        if (/^[A-F]$/i.test(q.answer)) return null;
        return { ...q, id, type: "short_answer", options: [], option_smiles: undefined, image_options: undefined };
      };
      if (q.type === "structure_choice") {
        const sm = (q.option_smiles ?? []).filter((x) => typeof x === "string" && /^[A-Za-z0-9@+\-\[\]\(\)=#$\\/%.:]{1,200}$/.test(x.trim())).map((x) => x.trim());
        if (sm.length < 2 || new Set(sm).size !== sm.length) return asText();
        const four = sm.slice(0, 4);
        const letters = LETTERS.slice(0, four.length);
        const correctIdx = resolveIdx(q.answer, [four, options]);
        if (correctIdx < 0 || correctIdx >= four.length) return asText();
        return { ...q, id, options: letters, option_smiles: four, image_options: undefined, answer: letters[correctIdx]! };
      }
      if (q.type === "image_choice") {
        const refs = (q.image_options ?? []).filter(
          (r) => r && Number.isInteger(r.page) && r.page >= 1 && r.page <= pageImages.length && Array.isArray(r.box) && r.box.length === 4,
        );
        if (refs.length < 2) return asText();
        const letters = LETTERS.slice(0, Math.min(refs.length, 4));
        const correctIdx = resolveIdx(q.answer, [options]);
        if (correctIdx < 0 || correctIdx >= letters.length) return asText();
        return { ...q, id, options: letters, image_options: refs.slice(0, letters.length), answer: letters[correctIdx]! };
      }
      if (q.type === "multiple_choice" && options.length > 1) {
        if (!options.includes(q.answer)) {
          const idx = resolveIdx(q.answer, [options]);
          if (idx >= 0 && idx < options.length) q = { ...q, answer: options[idx]! };
          else options = [...options.slice(0, Math.max(options.length - 1, 1)), q.answer];
        }
        options = [...options];
        for (let j = options.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          const tmp = options[j]!;
          options[j] = options[k]!;
          options[k] = tmp;
        }
      }
      return { ...q, id, options };
    })
    .filter((q) => q !== null);
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
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const [{ data: evs }, { data: asg }, { data: cls }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("title,event_type,event_date,event_time,class_id")
      .eq("user_id", userId)
      .gte("event_date", today)
      .lte("event_date", in7)
      .order("event_date")
      .limit(30),
    supabase
      .from("assignments")
      .select("title,due_date,status,priority,class_id")
      .eq("user_id", userId)
      .neq("status", "completed")
      .lte("due_date", in7)
      .order("due_date")
      .limit(30),
    supabase.from("classes").select("id,class_name,course_code").eq("user_id", userId),
  ]);
  const cname = (id: string | null) => {
    const c = (cls ?? []).find((x) => x.id === id);
    return c ? c.class_name : "General";
  };
  const calendar = (evs ?? [])
    .map((e) => `- ${e.event_date}${e.event_time ? ` ${e.event_time}` : ""} [${e.event_type}] ${e.title} (${cname(e.class_id)})`)
    .join("\n");
  const tasksDue = (asg ?? [])
    .map((a) => `- ${a.due_date}${a.due_date && a.due_date < today ? " OVERDUE" : ""} ${a.title} (${cname(a.class_id)}, ${a.priority})`)
    .join("\n");
  const timeNow = now.toISOString().slice(11, 16);

  const raw = await callAI(
    [
      {
        role: "system",
        content:
          "You are SyllabusStudy, a friendly student assistant planning today's study. Reply with json only. Use the real calendar and deadlines below; overdue and due-soon items come first, and exams/quizzes in the next few days get review time. Talk like a helpful friend: short, warm, specific. Never say 'based on the information provided'. Never invent course facts. Plain text, no LaTeX.",
      },
      {
        role: "user",
        content: `Today is ${today}, current UTC time ${timeNow}. The student has ${input.minutes ?? 60} minutes to study.${input.question ? ` They also asked: ${input.question}` : ""}
Return json: {"summary":string,"tasks":[{"time":string,"title":string,"detail":string,"minutes":number,"class":string,"tool":"flashcards"|"quiz"|"tutor"}]}
summary: one friendly sentence like "Here's your plan for today." plus the biggest priority. 2-4 tasks. "time" like "6:30 PM" or "". "class" must be an exact class name from the list or "General". "tool" = best SyllabusStudy tool for that task.

CLASSES: ${(cls ?? []).map((c) => c.class_name).join(", ") || "none"}
CALENDAR (next 7 days):
${calendar || "nothing scheduled"}
OPEN ASSIGNMENTS (due within 7 days or overdue):
${tasksDue || "none"}

MORE CONTEXT:
${contextText.slice(0, 6000)}`,
      },
    ],
    { maxTokens: 1200 },
  );

  return parseJsonBlock<{
    summary: string;
    tasks: Array<{ time?: string; title: string; detail: string; minutes: number; class: string; tool?: string }>;
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

/** The student's own Notes for this class, used as quiz material. */
async function personalNoteText(supabase: DB, userId: string, classId: string, ids: string[]): Promise<string> {
  let q = supabase.from("personal_notes").select("title,plain_text").eq("user_id", userId).eq("class_id", classId);
  if (ids.length) q = q.in("id", ids);
  const { data } = await q.order("updated_at", { ascending: false }).limit(12);
  const rows = (data ?? []).filter((r) => (r.plain_text ?? "").trim().length > 20);
  const per = Math.max(2000, Math.floor(20000 / Math.max(1, rows.length)));
  return rows.map((r) => `### My notes: ${r.title}\n${(r.plain_text ?? "").slice(0, per)}`).join("\n\n");
}

/** Lecture-note text (summary, key concepts, transcript). Empty notes are skipped so they never count as material. */
async function lectureText(supabase: DB, userId: string, classId: string, ids: string[]): Promise<string> {
  let q = supabase.from("lecture_notes").select("title,summary,key_concepts,transcript").eq("user_id", userId).eq("class_id", classId);
  if (ids.length) q = q.in("id", ids);
  const { data } = await q.order("created_at", { ascending: false }).limit(8);
  const rows = (data ?? []).filter((r) => `${r.summary ?? ""}${r.transcript ?? ""}`.trim().length > 40);
  const per = Math.max(1500, Math.floor(10000 / Math.max(1, rows.length)));
  return rows
    .map((r) => {
      const concepts = Array.isArray(r.key_concepts) ? (r.key_concepts as unknown[]).map(String).join("; ") : "";
      return `### Lecture: ${r.title}\n${r.summary ?? ""}\n${concepts ? `Key concepts: ${concepts}\n` : ""}${(r.transcript ?? "").slice(0, per)}`;
    })
    .join("\n\n");
}

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
  "You are SyllabusStudy helping a college student with their own homework.",
  "Teach, don't just dump answers: identify what each question asks, then show the worked reasoning step by step and state the final answer clearly.",
  "Use markdown with a short heading per question. Flag anything you cannot read from the file instead of guessing.",
  "End with a 2-3 bullet 'What to review' list.",
  "\n",
  OUTSIDE_LOOKUP,
  "\n",
  PLAIN_STYLE,
].join(" ");

export async function runAssignmentHelp(
  supabase: DB,
  userId: string,
  input: {
    assignmentId: string;
    question?: string | null | undefined;
    history?: { role: "user" | "assistant"; content: string }[] | undefined;
  },
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

  const history = (input.history ?? []).slice(-12);
  const followUp = history.length > 0 && !!input.question;
  const reply = await callAI([
    { role: "system", content: `${HELP_RULES}\n\nSTUDENT COURSE CONTEXT:\n${contextText.slice(0, 8000)}` },
    {
      role: "user",
      content: `Assignment: ${assignment.title}${assignment.due_date ? ` (due ${assignment.due_date})` : ""}
${assignment.description ? `Notes: ${assignment.description}` : ""}
${followUp ? "Here is my assignment. I'll ask follow-up questions next." : input.question ? `My specific question: ${input.question}` : "Walk me through the whole thing."}

ATTACHED FILES:
${attached.map((d) => `### ${d.file_name}\n${(d.extracted_text ?? "").slice(0, 12000)}`).join("\n\n")}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
    ...(followUp ? [{ role: "user" as const, content: input.question! }] : []),
  ], { search: true });

  if (followUp) return { reply };

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
  ], { search: true });

  return { reply };
}

/* ------------------------------------------------------------------ SnapQuick math tutor */

export type SnapMode = "learn" | "quick" | "tutor" | "practice" | "check" | "method";

const SNAP_TUTOR_RULES = `You are the SyllabusStudy SnapQuick tutor, a universal tutor for college students in ALL subjects (math, chemistry, organic chemistry, biology, anatomy & physiology, physics, statistics, psychology, sociology, history, English/writing, economics, computer science, languages, nursing, business, and more). It should feel like sitting with a tutor who is working the problem out WITH the student.

CORE RULE — DO THE WORK, DON'T JUST DESCRIBE IT:
- Never write "apply the chain rule", "use the quadratic formula", "substitute the values", "factor it", "identify the nucleophile", "analyze the source" or "improve your thesis" without actually doing it right there.
- Math example: for $h(x)=\\cos(2x)$ show outside $\\cos(u)$, inside $u=2x$, $\\frac{d}{du}[\\cos u]=-\\sin u$, $\\frac{du}{dx}=2$, then $$h'(x)=-\\sin(2x)\\cdot 2$$ $$\\boxed{h'(x)=-2\\sin(2x)}$$. For the quadratic formula: write the formula, list $a,b,c$, substitute the numbers, simplify the discriminant, then compute each root.
- Show every instructionally important transformation as its own display equation (e.g. $$2x+6-6=14-6$$ $$2x=8$$ $$\\frac{2x}{2}=\\frac{8}{2}$$ $$x=4$$) with a short reason for each operation. Do not pad trivial arithmetic with filler.
- The student must be able to follow from the original question to the answer and redo it alone on a test.

PIPELINE (internal): Understand → Solve/Analyze → Verify → Teach. Fully solve and verify privately BEFORE writing; never walk a student through a wrong calculation. Verify appropriately: substitute solutions back, recheck signs/domains/units, differentiate an integral result, check rule application, sanity-check word-problem answers. If a check isn't meaningful, skip it — never fake one. If uncertain, say so.

SUBJECT-AWARE: detect the subject, task type, concepts and level, then teach accordingly:
- Math: given → goal → each transformation → check.
- Chemistry/Organic: structures, mechanisms, electron movement (describe arrows in words), charges, stereochemistry, resonance, products — explain WHY the reaction/mechanism applies. Use \\ce{} only if unsure — prefer plain LaTeX like $\\text{H}_2\\text{O}$.
- Biology: structure → function → process → relationship → application; show sequences stage by stage.
- Anatomy & Physiology: structure → location → function → relationships → physiological significance; identify structures from diagrams.
- Physics: knowns → unknown → concept/formula → substitution with units → calculation → interpretation.
- Statistics: what's asked → concept → why → calculation → result → interpretation in context.
- History: context → causes → key events/people → consequences → significance; separate established facts from interpretations.
- English/Writing: what needs improvement → why → example → revised version → what changed. Teach; don't just rewrite.
- Psychology/Sociology: definition → theory → example → application → comparison with related concepts.
- Computer Science: goal → approach → code → how it works line by line → output → debugging tips.
- Other subjects: understand → demonstrate → explain → verify → teach.

MATH NOTATION (required):
- Write all math in LaTeX. Inline math uses $...$, display math uses $$...$$ on its own line.
- Use \\frac, \\sqrt, ^, _, \\leq, \\geq, \\neq, \\pi, \\theta, \\int, \\sum, \\lim, \\boxed etc. Never write sqrt(x), x^2 as plain text, or (x+2)/3 when a fraction is meant. No invented pseudo-math symbols.
- Never put currency dollar signs next to math; write "USD" or "\\$" instead.

ACCURACY:
- Never invent a number, symbol, label, fact, date, quote or rule. If part of a photo is blurry, cut off or unreadable, say exactly what you could not read and ask for it, or state the assumption you made. If a question is ambiguous, say how.

STRUCTURE for a full explanation. Use these exact "## " headings, in this order, and skip any that do not genuinely apply (never fabricate a check or a mistake):
## Problem — restate the recognized question (math in LaTeX; for photos: what you read, including diagram labels, units, table values).
## Understand — what we are given and what we need to find (short bullets), and the subject/concept involved.
## Method — the type of problem and the approach, and why that approach fits.
## Key formula — the rule, formula, definition or principle used (display math for math). Omit for non-formula subjects if not useful.
## Steps — "### Step 1: short title", "### Step 2: ..." subheadings. Each step actually PERFORMS the work (calculation, identification, analysis, revision) and ends with a line starting "**Why?**" explaining any decision a student might question (it is shown behind a tap-to-open button, so keep the step itself clean). Open steps with a short conversational bridge like "Now that we have the inside function, let's differentiate it." and then actually do it.
## Visual — include whenever a drawing genuinely helps understanding (not decoration). Draw it with ONE of these fenced code blocks (never ASCII art, never made-up Unicode structures):
  - \`\`\`smiles — a real chemical structure: first line a valid SMILES string, optional second line a short caption. Use one block per molecule (substrate, reagent, intermediate, product). Describe electron-pushing arrows in the text next to them.
  - \`\`\`mermaid — flowcharts, processes, cycles, mechanisms-as-steps, timelines (use "timeline"), concept maps (use "mindmap"), decision trees, simple charts ("pie" or "xychart-beta"). Keep node labels short and quoted, valid Mermaid syntax only, no styling directives.
  - \`\`\`svg — a small labeled diagram for physics (free-body diagrams, force vectors, circuits, ray diagrams, motion), biology/anatomy sketches, graphs of functions with axes, Newman projections or orbital diagrams. One <svg> with viewBox (max 400x300), stroke="currentColor"/fill="none" for lines, text with fill="currentColor", font-size 12-14, clear labels, arrowheads via <marker>. No scripts, no external images.
  Tables are fine for data, but never replace a needed diagram with a table. Visuals may also appear inside a step where they belong.
## Common mistake — one mistake students make here and how to avoid it.
## Check — the verification you did (substitution, units, reverse operation, evidence check).
## Final answer — for math/science the answer in $$\\boxed{...}$$ (in context for word problems); for other subjects a clear concise conclusion.
## Remember — one short sentence: the key idea for next time.
## Try this — one similar practice question (no solution).

CALCULATOR CHECKS: whenever the answer involves numbers or algebra, end your reply with a fenced block \`\`\`calc containing 1-8 lines, each "left == right" in math.js syntax, which a calculator will independently evaluate (e.g. "(7+5)/4 == 3", "2*(1/2)^2 - 7*(1/2) + 3 == 0", "sqrt(49-24) == 5", "derivative('cos(2x)', 'x') == '-2 sin(2 x)'" — derivatives/simplify compare symbolically, use only math.js functions). Use it to substitute answers back. The student never sees this block. Omit it for non-numeric subjects.

Complete work, but scannable: short sentences, no walls of text. For several problems on one photo, use "## Problem 1", then its sections, and so on.

CONVERSATION: This is an ongoing conversation about the same question. For follow-ups ("why did we do step 3", "I don't get step 2", "explain easier", "show more steps", "make it simpler", "what did I do wrong") answer that specific request directly using the earlier context, without asking to re-upload. "Show more steps" = redo the solution with finer steps; "make it easier/simpler" = shorter, beginner-friendly version. Use headings only if they help.

${OUTSIDE_LOOKUP}`;

const SNAP_MODE_RULES: Record<SnapMode, string> = {
  learn: "MODE: Learn — give the full structured explanation.",
  quick:
    "MODE: Quick answer — only ## Problem, a compact ## Steps with the important steps (still no skipped algebra), and ## Final answer.",
  tutor:
    "MODE: Tutor — do NOT reveal the final answer. Use ## Problem and ## Method, then give only the first step or a hint and ask the student what they think the next step is. On later turns, check their attempt, praise what is right, correct what is wrong with a hint, and move one step forward. Only reveal the answer once they reach it or explicitly ask.",
  practice:
    "MODE: Practice — create ONE new similar problem with different numbers under ## Try this. Do not solve it. Tell the student to reply with their answer and you will check it.",
  check:
    "MODE: Check my work — the photo/text is the student's own attempt. Under ## Problem restate it, then ## Your work: go line by line, mark each step as correct or the exact line where the error happens, explain the mistake, show the correct step, then ## Final answer and ## Remember.",
  method:
    "MODE: Another method — solve the same problem with a different valid method than before (e.g. quadratic formula instead of factoring, graphing, substitution). Use ## Method, ## Steps, ## Final answer, and a short note comparing the two methods under ## Remember.",
};

export async function runSnapTutor(
  supabase: DB,
  userId: string,
  input: {
    imageDataUrl?: string | null | undefined;
    classId?: string | null | undefined;
    mode: SnapMode;
    history: { role: "user" | "assistant"; content: string }[];
    message: string;
  },
) {
  const { contextText } = await buildClassContext(supabase, userId, input.classId ?? null);
  const history = input.history.slice(-12);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SNAP_TUTOR_RULES}\n\n${SNAP_MODE_RULES[input.mode]}\n\nSTUDENT COURSE CONTEXT (use only if relevant):\n${contextText.slice(0, 3000)}`,
    },
  ];

  history.forEach((m, i) => {
    // The photo rides along with the first student turn so follow-ups keep full context.
    if (i === 0 && m.role === "user" && input.imageDataUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  });

  if (!history.length && input.imageDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: input.message },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ],
    });
  } else {
    messages.push({ role: "user", content: input.message });
  }

  const rawDraft = await callAI(messages, { temperature: 0.2, maxTokens: 6000, search: true });
  const { text: draft, failures } = await runCalcChecks(rawDraft);

  // Independent check: a separate pass re-solves the problem and corrects the draft if needed.
  if ((input.mode === "tutor" || input.mode === "practice") && !failures.length) return { reply: draft };
  const calcNote = failures.length
    ? `\n\nCALCULATOR RESULTS — these checks from the draft FAILED when evaluated by an independent calculator, so the draft very likely contains an error. Re-solve carefully and return CORRECTED:\n${failures.join("\n")}`
    : "\n\nCALCULATOR RESULTS: all numeric checks passed.";
  try {
    const verdict = await callAI(
      [
        { role: "system", content: SNAP_VERIFY_RULES },
        {
          role: "user",
          content: input.imageDataUrl && !history.length
            ? [
                { type: "text", text: `STUDENT QUESTION:\n${input.message}\n\nTUTOR DRAFT:\n${draft}` },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ]
            : `STUDENT QUESTION:\n${input.message}\n\nTUTOR DRAFT:\n${draft}`,
        },
      ],
      { temperature: 0, maxTokens: 6000 },
    );
    const v = verdict.trim();
    if (/^VERIFIED\b/i.test(v) || v.length < 40) return { reply: draft };
    return { reply: v.replace(/^CORRECTED\s*/i, "").trim() };
  } catch (error) {
    // A failed independent check is not a verified answer.
    if (error instanceof Error && error.message.includes("having trouble connecting")) throw error;
    return { reply: draft };
  }
}

/** Evaluate the tutor's hidden ```calc block with math.js and strip it from the reply. */
async function runCalcChecks(reply: string): Promise<{ text: string; failures: string[] }> {
  const blocks = [...reply.matchAll(/```calc\s*\n([\s\S]*?)```/g)];
  const text = reply.replace(/```calc\s*\n[\s\S]*?```/g, "").trim();
  const lines = blocks.flatMap((b) => (b[1] ?? "").split("\n")).map((l) => l.trim()).filter((l) => l.includes("=="));
  if (!lines.length) return { text, failures: [] };
  const math = await import("mathjs");
  const failures: string[] = [];
  const toNum = (v: unknown): number | null => {
    try {
      const n = math.number(v as never) as unknown;
      return typeof n === "number" && Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };
  for (const line of lines.slice(0, 12)) {
    const [l, r] = line.split("==").map((x) => x.trim());
    if (!l || !r) continue;
    try {
      const lv = math.evaluate(l);
      const rv = math.evaluate(r);
      const ln = toNum(lv);
      const rn = toNum(rv);
      let ok: boolean;
      if (ln !== null && rn !== null) {
        ok = Math.abs(ln - rn) <= 1e-6 * Math.max(1, Math.abs(ln), Math.abs(rn));
      } else {
        // Symbolic: compare simplified difference, then sample numerically.
        const a = math.simplify(String(lv));
        const b = math.simplify(String(rv));
        const diff = math.simplify(`(${a.toString()}) - (${b.toString()})`).toString();
        ok = diff === "0";
        if (!ok) {
          const vars = new Set<string>();
          math.parse(`(${a}) - (${b})`).traverse((n: any) => {
            if (n.isSymbolNode && !(n.name in math)) vars.add(n.name);
          });
          ok = [0.37, 1.13, 2.71].every((x) => {
            const scope = Object.fromEntries([...vars].map((k) => [k, x]));
            const d = toNum(math.evaluate(`(${a}) - (${b})`, scope));
            return d !== null && Math.abs(d) < 1e-6;
          });
        }
      }
      if (!ok) failures.push(`${line}   (calculator: left = ${math.format(lv, { precision: 10 })}, right = ${math.format(rv, { precision: 10 })})`);
    } catch {
      // Unparseable check — ignore rather than block the answer.
    }
  }
  return { text, failures };
}

const SNAP_VERIFY_RULES = `You are an independent checker for a tutoring answer. Do NOT trust the draft. First solve/analyze the student's question yourself from scratch, then compare.
Check: every calculation and algebra step, signs, equation solutions (substitute back), derivatives/integrals (differentiate results), units, chemical balancing, reaction products and SMILES validity, statistics, code output, historical facts/dates, logical consistency, and that diagrams (mermaid/svg/smiles blocks) are valid and match the content.
If the draft is fully correct, reply with exactly: VERIFIED
If anything is wrong or a diagram block is invalid, reply with "CORRECTED" on the first line followed by the COMPLETE corrected answer in exactly the same format, headings and style as the draft (keep all its good parts, fix only what is wrong). If something genuinely cannot be determined (unreadable photo, ambiguous question), the corrected answer must say so plainly instead of guessing. Never mention this checking process. Keep any \`\`\`calc block out of your reply.`;


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

/* ------------------------------------------------------------------ ai text checker */

export type { AiCheckResult } from "./ai-detect";
import {
  combine as combineAiEvidence,
  isMeaningfullyRewritten,
  splitSentences,
  textSimilarity,
  type AiCheckResult as DetectResult,
} from "./ai-detect";
export { splitSentences };

const UNABLE = "Unable to analyze this text right now. Please try again in a moment.";

/**
 * Full-text AI-writing analysis: the model rates EVERY sentence (in batches),
 * then local style signals and the model judgement are combined per section.
 * A failed or incomplete model reply throws — it is never reported as "human".
 */
export async function runAiTextCheck(input: { text: string }): Promise<DetectResult> {
  const text = input.text.slice(0, 20000);
  const pieces = splitSentences(text);
  const idx = pieces.map((p, i) => (p.trim() ? i : -1)).filter((i) => i >= 0);
  const batches: number[][] = [];
  for (let i = 0; i < idx.length; i += 60) batches.push(idx.slice(i, i + 60));

  const probs: Record<number, number> = {};
  let genre = "";
  for (const batch of batches) {
    const numbered = batch.map((i) => `[${i}] ${pieces[i]!.trim().slice(0, 600)}`).join("\n");
    let raw: string;
    try {
      raw = await callAI(
        [
          {
            role: "system",
            content:
              'You are a careful AI-writing analyst. For EACH numbered sentence estimate the probability (0-100) that it was produced by an AI model, judging it in the context of its neighbours. Weigh: predictability of wording, generic phrasing, template-like structure, even rhythm, stock transitions, lack of specific personal detail. Calibrate honestly: polished, generic essay prose with even rhythm, stock transitions and no concrete detail is typically AI (75-95) — do not under-rate it. Formal, academic, technical or non-native (ESL) English is NOT AI by itself; look for concrete detail, citations, data and idiosyncrasy as human evidence. Quotes and list items should be near 50 unless clearly generated. Use the full range; avoid defaulting to 50. Also classify the overall genre. Reply with json only: {"genre":"casual"|"creative"|"academic"|"technical"|"esl"|"formal"|"other","p":{"<number>":0-100,...every number}}.',
          },
          { role: "user", content: numbered },
        ],
        { temperature: 0, maxTokens: 400 + batch.length * 12 },
      );
    } catch (e) {
      throw new Error(e instanceof Error && /key|settings|limit/i.test(e.message) ? e.message : UNABLE);
    }
    let parsed: { genre?: string; p?: Record<string, unknown> };
    try {
      parsed = parseJsonBlock(raw);
    } catch {
      throw new Error(UNABLE);
    }
    genre ||= String(parsed.genre ?? "");
    for (const i of batch) {
      const v = Number(parsed.p?.[String(i)]);
      if (Number.isFinite(v)) probs[i] = Math.max(0, Math.min(100, Math.round(v)));
    }
  }
  // Refuse to report a result when the model skipped most sentences.
  if (idx.length && Object.keys(probs).length < idx.length * 0.6) throw new Error(UNABLE);
  return combineAiEvidence(text, { probs, genre });
}

const HUMANIZE_RULES = `Rewrite the complete passage as clear, natural student writing. This is a real reconstruction, not a synonym swap.

REQUIRED:
- Preserve the original meaning, intended message, facts, names, numbers, dates, quotations, citations, and necessary subject terminology.
- Rebuild sentences and paragraphs where useful. You may split, combine, reorder, or recast sentences when the logical meaning stays the same.
- Vary sentence length and construction naturally. Use direct wording and transitions that fit the ideas instead of formulaic transitions.
- Remove repetitive, robotic, overly polished, generic, or needlessly formal phrasing.
- Keep the writer's apparent tone and level. The result should sound like a real student who understands the subject, while remaining coherent and grammatically appropriate.
- Preserve paragraph breaks when they carry meaning, but improve paragraph organization when needed.

NEVER:
- Add personal experiences, first-person claims, opinions, examples, evidence, facts, citations, or conclusions that are not in the source.
- Add intentional mistakes, typos, forced slang, choppy fragments, or awkward wording.
- Weaken or alter a claim merely to make it sound different.
- Mention AI detection, bypassing detectors, or this instruction.

The result must be meaningfully different in structure and wording. Returning the source, lightly editing punctuation, or replacing isolated words is a failure.
Reply with JSON only: {"text":"the complete rewritten passage"}.`;

function protectedDetails(text: string) {
  return [
    ...(text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []),
    ...(text.match(/\([^()\n]{1,80}\b(?:19|20)\d{2}[a-z]?(?:[^()\n]{0,40})\)/g) ?? []),
    ...(text.match(/\[[0-9]+(?:\s*,\s*[0-9]+)*\]/g) ?? []),
    ...(text.match(/[“"][^”"\n]{3,160}[”"]/g) ?? []),
  ].map((part) => part.trim());
}

function preservesProtectedDetails(original: string, rewrite: string) {
  return protectedDetails(original).every((detail) => rewrite.includes(detail));
}

async function humanizePass(
  original: string,
  attempt: number,
): Promise<string | null> {
  const push =
    attempt === 0
      ? ""
      : attempt === 1
        ? "\n\nYour previous draft was too close to the source. Reconstruct the passage more substantially: change the paragraph flow, split or combine sentences, vary their openings and lengths, and recast the explanation while preserving every claim and protected detail."
        : "\n\nThis is the final revision. The earlier drafts were superficial. Start from the ideas rather than the original sentence shapes, then write a fresh, natural version with different organization and rhythm. Preserve every fact, quotation, citation, number, and intended meaning.";
  const raw = await callAI(
    [
      { role: "system", content: HUMANIZE_RULES + push },
      { role: "user", content: `Rewrite this passage:\n\n${original}` },
    ],
    { temperature: attempt === 0 ? 0.75 : 0.9, maxTokens: Math.min(8000, 1200 + Math.ceil(original.length * 1.2)) },
  );
  try {
    const parsed = parseJsonBlock<{ text?: string }>(raw);
    if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text.trim();
  } catch {
    /* fall through to plain-text recovery */
  }
  // Model sometimes replies with plain text or truncated JSON — recover the passage.
  const m = raw.match(/"text"\s*:\s*"([\s\S]*)/);
  const plain = (m ? m[1]!.replace(/"\s*}?\s*`*\s*$/, "").replace(/\\n/g, "\n").replace(/\\"/g, '"') : raw.replace(/^```\w*|```$/g, "")).trim();
  return plain.length > 20 ? plain : null;
}

/**
 * Rewrite the complete passage so paragraph-level rhythm and organization can
 * change naturally. Near-copies or drafts that lose protected details are retried;
 * if no draft passes every check, the most different usable draft is returned.
 */
export async function runHumanize(input: { sentences: { index: number; text: string }[]; context: string }) {
  const original = input.context.trim();
  if (!original) return { text: null, similarity: null };

  let best: { text: string; similarity: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let rewrite: string | null = null;
    try {
      rewrite = await humanizePass(original, attempt);
    } catch (e) {
      if (attempt === 0 || (e instanceof Error && /key|settings|limit/i.test(e.message))) throw e;
      break;
    }
    if (!rewrite) continue;
    const similarity = textSimilarity(original, rewrite);
    if (isMeaningfullyRewritten(original, rewrite) && preservesProtectedDetails(original, rewrite)) {
      return { text: rewrite, similarity };
    }
    if (similarity < 0.95 && (!best || similarity < best.similarity)) best = { text: rewrite, similarity };
  }
  return best ?? { text: null, similarity: null };
}
