import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  authHeaders,
  candidateProviders,
  chatEndpoint,
  chatModel,
  requireAiKey,
  type AiProvider,
} from "./ai-key.server";

type DB = SupabaseClient<Database>;

export const CHAT_MODEL = "gemini-flash-latest";

/** Newest first — if Google retires one, the next is tried automatically. */
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];


type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google's OpenAI-compatible endpoint rejects `file` content parts (PDFs), so
 * for Gemini keys we translate the conversation to the native generateContent
 * API, which accepts inline PDF/image data.
 */
async function callGeminiNative(
  key: string,
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const system: string[] = [];
  const contents: Array<{ role: "user" | "model"; parts: unknown[] }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      if (typeof m.content === "string") system.push(m.content);
      else for (const b of m.content) if (b.type === "text") system.push(b.text);
      continue;
    }
    const parts: unknown[] = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else {
      for (const b of m.content) {
        if (b.type === "text") parts.push({ text: b.text });
        else if (b.type === "image_url") {
          const match = /^data:([^;]+);base64,(.*)$/s.exec(b.image_url.url);
          if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        } else if (b.type === "file") {
          const match = /^data:([^;]+);base64,(.*)$/s.exec(b.file.file_data);
          if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }
      }
    }
    if (parts.length) contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }

  const body = JSON.stringify({
    contents,
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    generationConfig: {
      temperature: opts?.temperature ?? 0.3,
      ...(opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  });

  let res: Response | null = null;
  for (const model of GEMINI_MODELS) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body },
    );
    if (res.ok || res.status !== 404) break;
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const text = res ? await res.text() : "";
    if (status === 429 || status >= 500) {
      throw new Error("The AI service is busy right now. Please try again in a moment.");
    }
    throw await providerError(new Response(text, { status }), "Google AI Studio");
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function hasFilePart(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => typeof m.content !== "string" && m.content.some((b) => b.type === "file"),
  );
}

function anthropicContent(content: ChatMessage["content"]): unknown {
  if (typeof content === "string") return content;
  const parts: unknown[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "image_url" || block.type === "file") {
      const dataUrl = block.type === "image_url" ? block.image_url.url : block.file.file_data;
      const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
      const mediaType = match?.[1];
      const data = match?.[2];
      if (!mediaType || !data) continue;
      if (block.type === "file" && match[1] === "application/pdf") {
        parts.push({
          type: "document",
          source: { type: "base64", media_type: mediaType, data },
        });
        continue;
      }
      parts.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
    }
  }
  return parts;
}

async function callAnthropic(
  key: string,
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string" ? message.content : message.content
      .filter((block) => block.type === "text")
      .map((block) => block.type === "text" ? block.text : "")
      .join("\n"))
    .join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: chatModel("anthropic"),
      max_tokens: opts?.maxTokens ?? 2048,
      temperature: opts?.temperature ?? 0.3,
      ...(system ? { system } : {}),
      messages: messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: anthropicContent(message.content),
        })),
    }),
  });
  if (!res.ok) throw await providerError(res, "Anthropic");
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Anthropic returned an empty response. Please try again.");
  return text;
}

async function providerError(res: Response, provider: string): Promise<Error> {
  const raw = await res.text();
  let detail = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    detail = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    // Keep the bounded response text when the provider did not return JSON.
  }
  if (res.status === 401 || res.status === 403) {
    const reason = detail && detail !== "{}" ? ` ${detail}` : "";
    return new Error(`${provider} rejected this credential.${reason} Check the selected provider and key in Settings → AI key.`);
  }
  if (res.status === 402) return new Error(`${provider}: ${detail || "Billing or credits are required."}`);
  if (res.status === 429) return new Error(`${provider} is rate-limiting this key. Wait a moment and try again.`);
  return new Error(`${provider} request failed (${res.status}): ${detail}`);
}

export async function callAI(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number; reasoningEffort?: string; _retry?: boolean },
): Promise<string> {
  // The student's own API key — the app never spends the workspace's AI credits.
  const cfg = requireAiKey();
  const providers = candidateProviders(cfg.provider, cfg.key);
  if (providers[0] === "google") {
    return callGeminiNative(cfg.key, messages, opts);
  }
  if (providers[0] === "anthropic") {
    return callAnthropic(cfg.key, messages, opts);
  }

  const buildPayload = (provider: AiProvider, model: string) =>
    JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      // OpenRouter needs the file-parser plugin enabled to read PDF attachments.
      ...(provider === "openrouter" && hasFilePart(messages)
        ? { plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }] }
        : {}),
    });

  const modelsFor = (provider: AiProvider) =>
    [chatModel(provider)];

  // Transient upstream hiccups (429 / 5xx) are retried with backoff so a single
  // blip doesn't surface as a failure to the student.
  const delays = [700, 1800, 3500];
  let res: Response | null = null;
  let lastBody = "";
  let lastStatus = 0;

  outer: for (const provider of providers) {
    const endpoint = chatEndpoint(provider);
    for (const model of modelsFor(provider)) {
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(provider, cfg.key) },
          body: buildPayload(provider, model),
        });

        if (res.ok) break outer;
        lastStatus = res.status;
        lastBody = await res.text();
         // A bad request/model/key is terminal; retrying it cannot fix it.
        if ([400, 401, 403, 404, 422].includes(res.status)) break;
        const transient = res.status === 429 || res.status >= 500;
        if (!transient || attempt === delays.length) break outer;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delays[attempt]!,
        );
      }
    }
  }

  if (!res || !res.ok) {
    const status = lastStatus || res?.status || 0;
    if (status === 429 || status >= 500) {
      throw new Error("The AI service is busy right now. Please try again in a moment.");
    }
    if (status === 401 || status === 403) throw await providerError(
      new Response(lastBody, { status }),
      providers[0] ?? cfg.provider,
    );
    if (status === 402) {
      throw new Error("Your AI provider account is out of credit or billing is not set up.");
    }
    throw await providerError(new Response(lastBody, { status }), providers[0] ?? cfg.provider);
  }


  const bodyText = await res.text();
  if (!bodyText.trim()) throw new Error("The AI returned an empty response. Please try again.");
  let data: { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw new Error("The AI response was incomplete. Please try again.");
  }
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content && !opts?._retry) {
    // One automatic retry with a bigger budget instead of bubbling an empty reply to the user.
    return callAI(messages, {
      ...opts,
      maxTokens: Math.max((opts?.maxTokens ?? 900) * 2, 1800),
      reasoningEffort: "none",
      _retry: true,
    });
  }
  return content;
}


/** Repairs a truncated JSON string by closing open strings/arrays/objects and dropping the trailing partial item. */
function repairJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1; // index just after the last completed top-level-ish value

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 1) lastSafe = i + 1;
    } else if (ch === "," && stack.length === 1) lastSafe = i;
  }

  let out = text;
  if (inString || stack.length) {
    if (lastSafe > 0) out = text.slice(0, lastSafe);
    // recompute closers for the trimmed text
    const closers: string[] = [];
    let s = false;
    let esc = false;
    for (let i = 0; i < out.length; i++) {
      const ch = out[i]!;
      if (s) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') s = false;
        continue;
      }
      if (ch === '"') s = true;
      else if (ch === "{") closers.push("}");
      else if (ch === "[") closers.push("]");
      else if (ch === "}" || ch === "]") closers.pop();
    }
    if (s) out += '"';
    out = out.replace(/,\s*$/, "");
    out += closers.reverse().join("");
  }
  return out;
}

export function parseJsonBlock<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const first = text.search(/[[{]/);
  if (first < 0 || !text) {
    throw new Error("The AI reply came back empty. Please try again.");
  }
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (first > 0 || (lastBrace > -1 && lastBrace < text.length - 1)) {
    text = text.slice(first, lastBrace > first ? lastBrace + 1 : undefined);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return JSON.parse(repairJson(text)) as T;
    } catch {
      throw new Error("The AI reply was cut off. Please try that again.");
    }
  }
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

const DOC_CHAR_BUDGET = 24000;

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
    { data: categories },
  ] = await Promise.all([
      supabase.from("classes").select("*").eq("user_id", userId),
      supabase
        .from("documents")
        .select("id,class_id,file_name,is_syllabus,extracted_text,syllabus_data,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
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
      supabase.from("grade_categories").select("class_id,name,weight").eq("user_id", userId),
    ]);


  const relevantClasses = (classes ?? []).filter((c) => !classId || c.id === classId);
  const classNames = relevantClasses.map((c) => `${c.course_code ?? ""} ${c.class_name}`.trim());
  const lines: string[] = [];

  // Class memory: the class of the newest uploaded document is the student's
  // current focus, so they never have to restate which course they mean.
  if (!classId) {
    const newest = (docs ?? []).find((d) => d.class_id);
    const focus = relevantClasses.find((c) => c.id === newest?.class_id);
    if (focus) {
      lines.push(
        `## CURRENT FOCUS CLASS: ${focus.course_code ? focus.course_code + " — " : ""}${focus.class_name}`,
        `The student's most recent upload was "${newest?.file_name}" for this class. When they ask something without naming a class, assume this one and answer directly instead of asking which class they mean.`,
        "",
      );
    }
  }

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

    const cats = (categories ?? []).filter((g) => g.class_id === c.id);
    if (cats.length) {
      lines.push(
        `Grade weights (from syllabus): ${cats.map((g) => `${g.name} ${g.weight}%`).join(", ")}`,
      );
    }

    // Syllabi first so course-wide facts always survive the budget.
    const classDocs = (docs ?? [])
      .filter((d) => d.class_id === c.id)
      .sort((a, b) => Number(b.is_syllabus) - Number(a.is_syllabus));
    const budget = Math.max(6000, Math.floor(DOC_CHAR_BUDGET / Math.max(relevantClasses.length, 1)));
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
          `- ${a.title} | due ${a.due_date ?? "n/a"} | ${a.status} | priority ${a.priority ?? "—"} | ${a.points_earned ?? "—"}/${a.points_possible ?? "—"} pts${a.category ? ` | category ${a.category}` : ""}${a.description ? `\n  details: ${String(a.description).slice(0, 800)}` : ""}`,
        );
      }
    }

    const ce = (events ?? []).filter((e) => e.class_id === c.id);
    if (ce.length) {
      lines.push("### CALENDAR");
      for (const e of ce)
        lines.push(
          `- ${e.event_date}${e.event_time ? ` at ${e.event_time}` : ""} ${e.event_type}: ${e.title}${e.description ? ` — ${String(e.description).slice(0, 400)}` : ""}`,
        );
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

/** Plain-text answer style: no LaTeX, no dollar signs, no filler. Reused by every prompt. */
export const PLAIN_STYLE = [
  "ANSWER STYLE (strict):",
  "- Write plain readable text. NEVER use LaTeX or math markup: no $, $$, \\(, \\), \\[, \\frac, \\times, \\cdot, ^{}, _{} or backslash commands.",
  "- Write math the way a person types it: (x + 2)/3, x^2, sqrt(9), 25%, 3 * 4. Use $ only for real money amounts.",
  "- No preamble, no restating the question, no sign-offs, no 'let me know if'. Answer immediately.",
  "- Short sentences. Bullets or numbered steps over paragraphs. Bold only the final answer.",
  "- Keep it under ~200 words unless the student asks for a full walkthrough or plan.",
].join("\n");

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
    "- You have long-term memory of this student below. Use it naturally; do not say you cannot remember past chats.",
    "- You already know which class each uploaded document belongs to. If the student does not name a class, use the CURRENT FOCUS CLASS (or the class whose materials match what they asked about) and answer. Never ask \"which class?\" when the context makes it obvious.",

    "",
    PLAIN_STYLE,
    "",
    `MODE: ${mode}. ${MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS["explain"]}`,
    "",
    "STUDENT CONTEXT:",
    contextText,
  ].join("\n");
}
