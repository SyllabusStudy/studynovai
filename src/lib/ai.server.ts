import type { SupabaseClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import type { Database } from "@/integrations/supabase/types";
import { fetchAiWithRetry } from "./ai-request.server";
import {
  authHeaders,
  candidateProviders,
  chatEndpoint,
  chatModel,
  requireAiKey,
  type AiProvider,
} from "./ai-key.server";

type DB = SupabaseClient<Database>;

export const CHAT_MODEL = "gemini-flash-lite-latest";

/** Shown when a free tier's quota is used up — nothing is ever charged instead. */
export const FREE_LIMIT_MESSAGE =
  "You've hit your provider's free AI limit for now. Wait a few minutes and try again — nothing was charged.";



type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};


/**
 * Google's OpenAI-compatible endpoint rejects `file` content parts (PDFs), so
 * for Gemini keys we translate the conversation to the native generateContent
 * API, which accepts inline PDF/image data.
 */
async function callGeminiNative(
  key: string,
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; search?: boolean },
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
        } else if (b.type === "video_url") {
          // Gemini accepts uploaded video as inline data, and YouTube links by URI.
          const url = b.video_url.url;
          const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
          if (match) {
            parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
          } else if (/^https?:\/\//i.test(url)) {
            parts.push({ file_data: { file_uri: url } });
          }
        } else if (b.type === "file") {
          const match = /^data:([^;]+);base64,(.*)$/s.exec(b.file.file_data);
          if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }

      }
    }
    if (parts.length) contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }

  // Video and audio need the fuller Flash model; the lite model can reject media parts.
  const hasVideo = contents.some((c) =>
    c.parts.some((p) => {
      const part = p as { inline_data?: { mime_type?: string }; file_data?: unknown };
      const mt = part.inline_data?.mime_type ?? "";
      return Boolean(part.file_data) || mt.startsWith("video/") || mt.startsWith("audio/");
    }),
  );

  // Live web lookup, only for free-form answers (never for JSON-shaped generations).
  const useSearch = opts?.search === true && !hasVideo;

  const body = JSON.stringify({
    contents,
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: opts?.temperature ?? 0.3,
      ...(opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  });

  const model = hasVideo ? "gemini-flash-latest" : CHAT_MODEL;
  const res = await fetchAiWithRetry(
    "google",
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body },
    // A grounded attempt gives up after one try so the plain answer can take over quickly.
    useSearch ? 1 : undefined,
  );
  if (!res.ok) throw await providerError(res, "Google AI Studio");

  const data = (await res.json()) as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (data.candidates?.[0]?.finishReason === "SAFETY") throw new Error("This request could not be completed. Please try a different question.");
  const answer = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!answer) throw new Error("The AI returned no answer. Please try again.");
  return answer;
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
  const res = await fetchAiWithRetry("anthropic", "https://api.anthropic.com/v1/messages", {
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
  const data = (await res.json()) as { stop_reason?: string; content?: Array<{ type?: string; text?: string }> };
  if (data.stop_reason === "refusal") throw new Error("This request could not be completed. Please try a different question.");
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
    return new Error(`${provider} did not allow this request.${reason} Check the selected provider and key in Settings → AI key.`);
  }
  if (res.status === 402) return new Error(FREE_LIMIT_MESSAGE);
  if (res.status === 429 || res.status >= 500) return new Error("I’m having trouble connecting right now. Your question is saved — try again in a moment.");
  if (res.status === 404) return new Error("The selected AI model isn't available right now. Check your AI key settings.");
  return new Error("This question couldn't be processed. Try a shorter question or a smaller file.");
}

export async function callAI(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: string;
    /** Allow the model to look up outside information on the web. */
    search?: boolean;
  },
): Promise<string> {
  if (opts?.search) {
    try {
      return await callAIOnce(messages, opts);
    } catch (error) {
      // Web lookup can hit tighter limits on student keys; answer without it instead of failing.
      if (error instanceof Error && /free limit|API key|AI_KEY/i.test(error.message)) throw error;
      return callAIOnce(messages, { ...opts, search: false });
    }
  }
  return callAIOnce(messages, opts);
}

async function callAIOnce(
  messages: ChatMessage[],
  opts?: Parameters<typeof callAI>[1],
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
      // OpenRouter exposes web lookup through the ":online" model suffix.
      model: provider === "openrouter" && opts?.search ? `${model}:online` : model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      // OpenRouter needs the file-parser plugin enabled to read PDF attachments.
      ...(provider === "openrouter" && hasFilePart(messages)
        ? { plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }] }
        : {}),
    });

  // One selected provider/model per operation; only transient failures retry sequentially.
  const provider = providers[0] ?? cfg.provider;
  const res = await fetchAiWithRetry(provider, chatEndpoint(provider), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(provider, cfg.key) },
    body: buildPayload(provider, chatModel(provider)),
  }, opts?.search ? 1 : undefined);

  if (!res.ok) {
    const status = res.status;
    if (status === 402) throw new Error(FREE_LIMIT_MESSAGE);
    throw await providerError(res, provider);
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
  if (!content) throw new Error("The AI returned no answer. Please try again.");
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

/** Cuts a clipped reply back to its last finished object at any depth and closes it, keeping completed items. */
function salvageJson(text: string): unknown {
  let end = text.length;
  for (let tries = 0; tries < 300; tries++) {
    end = text.lastIndexOf("}", end - 1);
    if (end < 0) return undefined;
    const cut = text.slice(0, end + 1);
    const closers: string[] = [];
    let s = false;
    let esc = false;
    for (let i = 0; i < cut.length; i++) {
      const ch = cut[i]!;
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
    if (s) continue;
    try {
      return JSON.parse(cut + closers.reverse().join(""));
    } catch {
      /* try an earlier cut */
    }
  }
  return undefined;
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
      const salvaged = salvageJson(text);
      if (salvaged !== undefined) return salvaged as T;
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

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Reads text out of Word, PowerPoint and Excel (Office Open XML) files. */
function extractOfficeText(fileName: string, bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return "";
  }
  const dec = new TextDecoder();
  const read = (p: string) => (files[p] ? dec.decode(files[p]) : "");
  const num = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".docx")) {
    const xml = read("word/document.xml");
    return xml
      .split(/<\/w:p>/)
      .map((p) => decodeXmlEntities([...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1] ?? "").join("")))
      .filter((l) => l.trim())
      .join("\n");
  }
  if (lower.endsWith(".pptx")) {
    const slides = Object.keys(files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => num(a) - num(b));
    return slides
      .map((s, i) => {
        const paras = read(s)
          .split(/<\/a:p>/)
          .map((p) => decodeXmlEntities([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1] ?? "").join("")))
          .filter((l) => l.trim());
        return `## Slide ${i + 1}\n${paras.join("\n")}`;
      })
      .join("\n\n");
  }
  // xlsx
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXmlEntities([...(m[1] ?? "").matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheets = Object.keys(files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => num(a) - num(b));
  return sheets
    .map((s, i) => {
      const rows = [...read(s).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
        [...(r[1] ?? "").matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map((c) => {
            const isShared = /t="s"/.test(c[1] ?? "");
            const inline = (c[2] ?? "").match(/<t[^>]*>([^<]*)<\/t>/)?.[1];
            const v = (c[2] ?? "").match(/<v>([^<]*)<\/v>/)?.[1] ?? "";
            return inline !== undefined ? decodeXmlEntities(inline) : isShared ? (shared[Number(v)] ?? "") : v;
          })
          .join(", "),
      );
      return `## Sheet ${i + 1}\n${rows.filter((r) => r.replace(/[, ]/g, "")).join("\n")}`;
    })
    .join("\n\n");
}

/** Extract plain text from an uploaded file using the AI gateway (PDF/image) or direct decode. */
export async function extractTextFromFile(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ text: string; note?: string }> {
  const { fileName, bytes } = params;
  const mime = params.mimeType || "application/octet-stream";

  if (TEXTUAL.some((t) => mime.startsWith(t)) || /\.(txt|md|csv|tsv|rtf)$/i.test(fileName)) {
    return { text: new TextDecoder().decode(bytes) };
  }

  if (/\.(docx|pptx|xlsx)$/i.test(fileName)) {
    const text = extractOfficeText(fileName, bytes);
    return text ? { text } : { text: "", note: "This file looks empty or could not be opened." };
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

const DOC_CHAR_BUDGET = 80000;

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
    { data: lectures },
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
      supabase
        .from("lecture_notes")
        .select("title,class_id,summary,key_concepts,transcript,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
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
    // Per-class budget, shared across its documents so every file gets a fair slice.
    let remaining = Math.max(12000, Math.floor(DOC_CHAR_BUDGET / Math.max(relevantClasses.length, 1)));
    const readable = classDocs.filter((d) => (d.extracted_text ?? "").trim());
    readable.forEach((d, i) => {
      if (remaining <= 0) return;
      const share = Math.max(3000, Math.floor(remaining / (readable.length - i)));
      const text = (d.extracted_text ?? "").slice(0, Math.min(share, remaining));
      remaining -= text.length;
      lines.push(
        `### DOCUMENT: ${d.file_name}${d.is_syllabus ? " (SYLLABUS)" : ""} [doc:${d.id}]`,
        text,
      );
    });

    const cl = (lectures ?? []).filter((l) => l.class_id === c.id).slice(0, 8);
    for (const l of cl) {
      const concepts = Array.isArray(l.key_concepts) ? (l.key_concepts as unknown[]).map((k) => (typeof k === "string" ? k : JSON.stringify(k))).join("; ") : "";
      const body = [l.summary, concepts && `Key concepts: ${concepts}`, !l.summary && l.transcript ? l.transcript.slice(0, 4000) : ""].filter(Boolean).join("\n").slice(0, 5000);
      if (body.trim()) lines.push(`### LECTURE NOTE: ${l.title}`, body);
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
  "- Be as short as possible: under ~120 words unless the student explicitly asks for a full walkthrough or plan. Never pad.",
].join("\n");

/** Lets every tool pull in trustworthy outside information when the student's own files fall short. */
export const OUTSIDE_LOOKUP = [
  "OUTSIDE INFORMATION:",
  "- You can look things up beyond the student's uploaded files: definitions, formulas, standard methods, textbook concepts, recent facts, worked examples and reputable explanations.",
  "- Use it whenever their own materials don't cover what they asked, or when a concept needs background, a verified formula, or a real-world example.",
  "- Prefer reliable academic and textbook-level sources. When an answer leans on an outside source, add a short line naming it, e.g. Source: Khan Academy — Chain rule.",
  "- Keep the course-specific grounding rules: never invent this student's course policies, dates, grades or professor statements from outside information.",
].join("\n");

/** Tutor default: always a deep dive, not a one-liner. */
export const DEEP_DIVE_STYLE = [
  "DEPTH (default: DEEP DIVE, always):",
  "- Never give a shallow 'here's this, there's that' answer. Dig in like a great tutor in office hours.",
  "- Structure most answers as: **Short answer** (1-2 lines) → **Explanation** (the why and how, step by step) → **Example** (ideally from the student's own files) → **How it connects** (to other topics in their class/syllabus) → **Common mistakes or exam tips** → **Check yourself** (1-2 quick questions).",
  "- Skip sections that truly don't fit (e.g. a deadline lookup just needs the date and source), but explain concepts fully.",
  "- Cover everything relevant in the student's materials, not just the first match. If the files only partly answer it, use what they say, then fill gaps with outside knowledge and say which part came from where.",
  "- Only be brief if the student explicitly asks for a quick or short answer.",
].join("\n");

export function tutorSystemPrompt(mode: string, contextText: string): string {
  return [
    "You are SyllabusStudy, a warm, sharp college study tutor for one specific student.",
    "",
    "GROUNDING RULES (critical):",
    "- The student's own uploaded materials appear below under STUDENT CONTEXT. Always prefer them.",
    "- When you answer using the student's documents, end the relevant part with a source line exactly like: Source: <CLASS CODE OR NAME> <Document name> — <section>.",
    "- NEVER invent course policies, dates, grading weights, professor statements or attendance limits. If it is not in the context, say so plainly, e.g. \"I couldn't find an attendance limit in your uploaded syllabus.\"",
    "- You MAY teach general academic subject matter from your own knowledge; just don't fabricate course-specific facts.",
    "- Use markdown headings/bullets, and never pretend to remember something absent from the context.",
    "- READ THE FILES CLOSELY: before answering, search every relevant DOCUMENT and LECTURE NOTE below for the exact passages that relate to the question. Quote or closely paraphrase the specific details (definitions, examples, numbers, names, slide points) instead of giving generic textbook answers.",
    "- You have long-term memory of this student below. Use it naturally; do not say you cannot remember past chats.",
    "- AUTOMATIC CLASS MATCHING: the student never picks a class. Scan every CLASS below and match the question to the class whose name, syllabus, notes or assignments fit it best; answer from that class and name it in the source line. Use the CURRENT FOCUS CLASS only for course-specific questions (deadlines, policies, 'my exam') that name no class.",
    "- If the question does not match any of the student's classes (general knowledge, an outside topic, a homework problem not in their materials), answer it directly and fully from your own knowledge and outside information. Do not mention that it isn't in their classes unless they asked about a course-specific fact.",
    "- NEVER ask \"which class?\" — always answer.",
    "",
    "STUDYMATE STUDY SKILLS (use the one that fits, in a single reply — never ask a clarifying question first):",
    "- Explain: plain-language explanation, then one worked example from the student's own material.",
    "- Quiz me: 3-5 questions from the uploaded material, answers hidden under an 'Answers' heading at the end.",
    "- Flashcards: compact 'Term — definition' lines pulled from the documents.",
    "- Summarize: short sections with bullets, flagging what is most likely to be tested.",
    "- Plan: day-by-day steps using the student's real deadlines from the context.",
    "- Homework help: guide with steps and hints; give the final answer only after showing the reasoning.",
    "- Deadlines/policies: quote the syllabus wording, with the source line.",
    "- Answer fully in one response; do not offer to continue in another message.",
    "",
    OUTSIDE_LOOKUP,
    "",
    PLAIN_STYLE.replace(
      "- Be as short as possible: under ~120 words unless the student explicitly asks for a full walkthrough or plan. Never pad.",
      "",
    ),
    "",
    DEEP_DIVE_STYLE,
    "",
    `MODE: ${mode}. ${MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS["explain"]}`,
    "",
    "STUDENT CONTEXT:",
    contextText,
  ].join("\n");
}
