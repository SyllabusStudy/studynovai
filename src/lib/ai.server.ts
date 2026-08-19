import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const CHAT_MODEL = "google/gemini-3.5-flash";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

export async function callAI(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project yet.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: opts?.model ?? CHAT_MODEL,
      messages,
      temperature: opts?.temperature ?? 0.3,
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("The AI is busy right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export function parseJsonBlock<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const first = text.search(/[[{]/);
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (first > 0 || lastBrace < text.length - 1) text = text.slice(Math.max(first, 0), lastBrace + 1);
  return JSON.parse(text) as T;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const TEXTUAL = ["text/plain", "text/markdown", "application/json", "text/csv"];

/** Extract plain text from an uploaded file using the AI gateway (PDF/image) or direct decode. */
export async function extractTextFromFile(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ text: string; note?: string }> {
  const { fileName, bytes } = params;
  const mime = params.mimeType || "application/octet-stream";

  if (TEXTUAL.some((t) => mime.startsWith(t)) || /\.(txt|md|csv)$/i.test(fileName)) {
    return { text: new TextDecoder().decode(bytes) };
  }

  const base64 = bytesToBase64(bytes);
  const instruction =
    "Transcribe ALL readable text from this document exactly, preserving headings, tables (as plain rows), dates and bullet structure. Do not summarize, do not add commentary. If the document is unreadable, reply with the single word UNREADABLE.";

  if (mime.startsWith("image/")) {
    const text = await callAI([
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ]);
    return { text: text === "UNREADABLE" ? "" : text };
  }

  if (mime === "application/pdf" || /\.pdf$/i.test(fileName)) {
    const text = await callAI([
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${base64}` } },
        ],
      },
    ]);
    return { text: text === "UNREADABLE" ? "" : text };
  }

  return {
    text: "",
    note: "This file type is stored safely but its text could not be read automatically. Upload a PDF, image or text file for AI-readable content.",
  };
}

export type ClassContext = {
  className: string;
  courseCode: string | null;
  professor: string | null;
  docs: Array<{ id: string; name: string; isSyllabus: boolean; text: string }>;
  assignments: Array<{ title: string; due: string | null; status: string; points: number | null }>;
  events: Array<{ title: string; type: string; date: string }>;
};

const DOC_CHAR_BUDGET = 8000;

export async function buildClassContext(
  supabase: DB,
  userId: string,
  classId: string | null,
): Promise<{ contextText: string; classes: string[] }> {
  const [
    { data: classes },
    { data: docs },
    { data: assignments },
    { data: events },
    { data: quizzes },
    { data: memory },
  ] = await Promise.all([
      supabase.from("classes").select("*").eq("user_id", userId),
      supabase
        .from("documents")
        .select("id,class_id,file_name,is_syllabus,extracted_text,syllabus_data")
        .eq("user_id", userId),
      supabase.from("assignments").select("*").eq("user_id", userId),
      supabase.from("calendar_events").select("*").eq("user_id", userId),
      supabase
        .from("quizzes")
        .select("title,class_id,score,weak_topics,completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(10),
      supabase
        .from("ai_memory")
        .select("content,kind,class_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);


  const relevantClasses = (classes ?? []).filter((c) => !classId || c.id === classId);
  const classNames = relevantClasses.map((c) => `${c.course_code ?? ""} ${c.class_name}`.trim());
  const lines: string[] = [];

  for (const c of relevantClasses) {
    lines.push(
      `## CLASS: ${c.course_code ? c.course_code + " — " : ""}${c.class_name}`,
      `Professor: ${c.professor ?? "unknown"} | Semester: ${c.semester ?? "unknown"}`,
    );
    if (c.professor_email) lines.push(`Professor email: ${c.professor_email}`);
    if (c.office_hours) lines.push(`Office hours: ${c.office_hours}`);
    if (c.attendance_policy) lines.push(`Attendance policy (from syllabus): ${c.attendance_policy}`);
    if (c.late_work_policy) lines.push(`Late work policy (from syllabus): ${c.late_work_policy}`);
    if (c.makeup_policy) lines.push(`Make-up exam policy (from syllabus): ${c.makeup_policy}`);
    if (c.required_materials) lines.push(`Required materials: ${c.required_materials}`);

    const classDocs = (docs ?? []).filter((d) => d.class_id === c.id);
    const budget = Math.max(3000, Math.floor(DOC_CHAR_BUDGET / Math.max(relevantClasses.length, 1)));
    for (const d of classDocs) {
      const text = (d.extracted_text ?? "").slice(0, budget);
      if (!text) continue;
      lines.push(
        `### DOCUMENT: ${d.file_name}${d.is_syllabus ? " (SYLLABUS)" : ""} [doc:${d.id}]`,
        text,
      );
    }

    const ca = (assignments ?? []).filter((a) => a.class_id === c.id);
    if (ca.length) {
      lines.push("### ASSIGNMENTS");
      for (const a of ca) {
        lines.push(
          `- ${a.title} | due ${a.due_date ?? "n/a"} | ${a.status} | ${a.points_earned ?? "—"}/${a.points_possible ?? "—"} pts${a.category ? ` | category ${a.category}` : ""}`,
        );
      }
    }

    const ce = (events ?? []).filter((e) => e.class_id === c.id);
    if (ce.length) {
      lines.push("### CALENDAR");
      for (const e of ce) lines.push(`- ${e.event_date} ${e.event_type}: ${e.title}`);
    }

    const cq = (quizzes ?? []).filter((q) => q.class_id === c.id);
    if (cq.length) {
      lines.push("### RECENT QUIZ RESULTS");
      for (const q of cq) {
        lines.push(
          `- ${q.title}: ${q.score ?? "—"}%${Array.isArray(q.weak_topics) && q.weak_topics.length ? ` | weak: ${(q.weak_topics as string[]).join(", ")}` : ""}`,
        );
      }
    }
  }

  const mem = (memory ?? []).filter((m) => !classId || !m.class_id || m.class_id === classId);
  if (mem.length) {
    lines.push("## WHAT YOU REMEMBER ABOUT THIS STUDENT (long-term memory)");
    for (const m of mem) lines.push(`- ${m.content}`);
  }

  if (!lines.length) lines.push("The student has not added any classes or documents yet.");
  return { contextText: lines.join("\n"), classes: classNames };

}

const MODE_INSTRUCTIONS: Record<string, string> = {
  explain: "Explain the concept in simple, plain language with a concrete example. Keep it tight.",
  step_by_step:
    "Walk through the problem one numbered step at a time. Never skip algebra or reasoning steps. State the final answer clearly at the end.",
  teach_me:
    "Teach the topic as if the student has never seen it. Start from intuition, build up vocabulary, then give a worked example and a check-for-understanding question.",
  quiz_me:
    "Ask exactly ONE question, then stop and wait for the student's answer. When they answer, say whether it is right, explain briefly, then ask the next question.",
  check_answer:
    "The student is submitting an answer. Say clearly whether it is correct, pinpoint exactly where the reasoning went wrong if not, and show the correct path.",
  summarize:
    "Summarize the relevant uploaded material with short sections and bullet points. Highlight what is most likely to be tested.",
  exam_prep:
    "Build a concrete, day-by-day study plan up to the exam date using the student's real deadlines and weak topics.",
};

export function tutorSystemPrompt(mode: string, contextText: string): string {
  return [
    "You are StudyMate AI, a warm, sharp college study tutor for one specific student.",
    "",
    "GROUNDING RULES (critical):",
    "- The student's own uploaded materials appear below under STUDENT CONTEXT. Always prefer them.",
    "- When you answer using the student's documents, end the relevant part with a source line exactly like: Source: <CLASS CODE OR NAME> <Document name> — <section>.",
    "- NEVER invent course policies, dates, grading weights, professor statements or attendance limits. If it is not in the context, say so plainly, e.g. \"I couldn't find an attendance limit in your uploaded syllabus.\"",
    "- You MAY teach general academic subject matter from your own knowledge; just don't fabricate course-specific facts.",
    "- Be concise by default, use markdown headings/bullets, and never pretend to remember something absent from the context.",
    "",
    `MODE: ${mode}. ${MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS["explain"]}`,
    "",
    "STUDENT CONTEXT:",
    contextText,
  ].join("\n");
}
