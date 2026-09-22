import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PLAIN_STYLE, buildClassContext, callAI, type ChatMessage } from "./ai.server";

type DB = SupabaseClient<Database>;

export type VideoChatTurn = { role: "user" | "assistant"; content: string };

/** Normalises anything a student might paste (missing scheme, spaces, tracking junk). */
export function normalizeVideoUrl(raw: string): string {
  let s = raw.trim().replace(/^[<(]|[>)]$/g, "");
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  return s;
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(normalizeVideoUrl(url));
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
    const v = u.searchParams.get("v");
    if (v) return v.split("&")[0]!;
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([^/?&#]+)/);
    return m?.[2] ?? null;
  } catch {
    return null;
  }
}

/** Pulls YouTube's own caption track and flattens it to plain text. */
type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

type PlayerInfo = {
  title: string | null;
  description: string | null;
  tracks: CaptionTrack[];
  blockedReason: string | null;
};

const CLIENTS = [
  {
    ua: ANDROID_UA,
    client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", androidSdkVersion: 34 },
  },
  {
    ua: WEB_UA,
    client: { clientName: "WEB", clientVersion: "2.20240701.00.00", hl: "en" },
  },
  {
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X)",
    client: { clientName: "IOS", clientVersion: "20.10.4", hl: "en" },
  },
];

/** Reads title, description and caption tracks, trying several YouTube clients. */
async function youtubePlayer(videoId: string): Promise<PlayerInfo> {
  let best: PlayerInfo = { title: null, description: null, tracks: [], blockedReason: null };
  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": c.ua },
        body: JSON.stringify({ context: { client: c.client }, videoId }),
      });
      const body = await res.text();
      if (!body.trim()) continue;
      const json = JSON.parse(body) as {
        videoDetails?: { title?: string; shortDescription?: string };
        playabilityStatus?: { status?: string; reason?: string };
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
      };
      const info: PlayerInfo = {
        title: json.videoDetails?.title?.trim() || best.title,
        description: json.videoDetails?.shortDescription?.trim() || best.description,
        tracks: json.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
        blockedReason:
          json.playabilityStatus?.status && json.playabilityStatus.status !== "OK"
            ? json.playabilityStatus.reason ?? json.playabilityStatus.status
            : null,
      };
      best = { ...info, tracks: info.tracks.length ? info.tracks : best.tracks };
      if (best.tracks.length) return best;
    } catch {
      // try the next client
    }
  }
  return best;
}

function stamp(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `[${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}]`;
}

/** json3 caption payload → timestamped lines. */
function parseJson3(body: string): string {
  const parsed = JSON.parse(body) as {
    events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
  };
  return (parsed.events ?? [])
    .map((e) => {
      const text = (e.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return null;
      return `${stamp((e.tStartMs ?? 0) / 1000)} ${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function decodeXml(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Legacy XML caption payload → timestamped lines. */
function parseXmlCaptions(body: string): string {
  const out: string[] = [];
  const re = /<(?:text|p)[^>]*?(?:start|t)="([\d.]+)"[^>]*>([\s\S]*?)<\/(?:text|p)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const raw = Number(m[1]);
    const seconds = raw > 10_000 ? raw / 1000 : raw; // srv3/timedtext use ms
    const text = decodeXml(m[2] ?? "");
    if (text) out.push(`${stamp(seconds)} ${text}`);
  }
  return out.join("\n").trim();
}

async function fetchCaption(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": ANDROID_UA } });
    const body = await res.text();
    if (!body.trim()) return null;
    const text = body.trimStart().startsWith("{") ? parseJson3(body) : parseXmlCaptions(body);
    return text.length > 40 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Pulls YouTube's own captions, trying every track and format YouTube offers
 * (manual English, auto-generated, other languages auto-translated to English)
 * before giving up.
 */
async function youtubeTranscript(
  videoId: string,
): Promise<{ title: string | null; description: string | null; transcript: string | null; blockedReason: string | null }> {
  const { title, description, tracks, blockedReason } = await youtubePlayer(videoId);

  const ordered = [
    ...tracks.filter((t) => t.languageCode?.startsWith("en") && t.kind !== "asr"),
    ...tracks.filter((t) => t.languageCode?.startsWith("en") && t.kind === "asr"),
    ...tracks.filter((t) => !t.languageCode?.startsWith("en")),
  ];

  for (const track of ordered) {
    if (!track.baseUrl) continue;
    const base = track.baseUrl.replace(/&fmt=\w+/, "");
    const foreign = !track.languageCode?.startsWith("en");
    const attempts = [
      `${base}&fmt=json3`,
      base,
      `${base}&fmt=srv3`,
      ...(foreign ? [`${base}&tlang=en&fmt=json3`, `${base}&tlang=en`] : []),
    ];
    for (const url of attempts) {
      const transcript = await fetchCaption(url);
      if (transcript) return { title, description, transcript, blockedReason };
    }
  }

  // Last resort: YouTube's public timedtext endpoint (works for some videos
  // whose player response hides the track list).
  for (const lang of ["en", "en-US", "en-GB"]) {
    for (const extra of ["", "&kind=asr"]) {
      const transcript = await fetchCaption(
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${extra}&fmt=json3`,
      );
      if (transcript) return { title, description, transcript, blockedReason };
    }
  }

  return { title, description, transcript: null, blockedReason };
}



const NOTE_RULES = [
  "You are StudyMate AI turning a video into college study notes for one student.",
  "Write notes the student can revise from without rewatching: organized markdown with '## ' sections that follow the video's order.",
  "Every section: 3-6 tight bullets of the actual content (definitions, steps, formulas, examples, numbers, names). Include the [m:ss] timestamp next to a bullet when the transcript shows one.",
  "Then add '## Key terms' (term — plain definition), '## Formulas or steps' (skip if none), and '## Likely test questions' (4-6 questions).",
  "Start the whole answer with a '## Summary' section: 2-3 sentences on what the video covers.",
  "Only use what the video actually says. Never invent content. Note plainly if audio/content was unclear or cut off.",
  "\n",
  PLAIN_STYLE,
  "\n",
  "IGNORE the word-limit rule above for this task: full notes are expected.",
].join(" ");

const MAX_TRANSCRIPT = 60_000;

async function noteFromTranscript(transcript: string, title: string, contextText: string) {
  return callAI(
    [
      {
        role: "system",
        content: `${NOTE_RULES}\n\nSTUDENT COURSE CONTEXT (for wording and connections only):\n${contextText.slice(0, 4000)}`,
      },
      {
        role: "user",
        content: `Video title: ${title}\n\nTRANSCRIPT (timestamps in brackets):\n${transcript.slice(0, MAX_TRANSCRIPT)}`,
      },
    ],
    { maxTokens: 3200, temperature: 0.2 },
  );
}

async function noteFromMedia(
  source: { kind: "url" | "data"; value: string },
  title: string,
  contextText: string,
) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${NOTE_RULES}\n\nSTUDENT COURSE CONTEXT (for wording and connections only):\n${contextText.slice(0, 4000)}`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Watch this video${title ? ` ("${title}")` : ""} and take my study notes on it.`,
        },
        { type: "video_url", video_url: { url: source.value } },
      ],
    },
  ];
  return callAI(messages, { maxTokens: 3200, temperature: 0.2 });
}

/** Reads a non-YouTube video page's own title/description (Vimeo, Loom, etc.). */
async function pageMetadata(url: string): Promise<{ title: string | null; description: string | null }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": WEB_UA } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("html")) return { title: null, description: null };
    const html = (await res.text()).slice(0, 400_000);
    const meta = (prop: string) =>
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      )?.[1] ?? null;
    const title = meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
    return {
      title: title ? decodeXml(title) : null,
      description: meta("og:description") ?? meta("description"),
    };
  } catch {
    return { title: null, description: null };
  }
}

/** Fallback notes built from the video's own title and description only. */
async function noteFromDescription(title: string, description: string, contextText: string) {
  const notes = await callAI(
    [
      {
        role: "system",
        content: `${NOTE_RULES}\n\nSTUDENT COURSE CONTEXT (for wording and connections only):\n${contextText.slice(0, 4000)}`,
      },
      {
        role: "user",
        content: `The video's captions were unavailable, so work only from its title and description. Do not invent details that are not stated.\n\nTitle: ${title}\n\nDescription:\n${description.slice(0, 8000)}`,
      },
    ],
    { maxTokens: 2000, temperature: 0.2 },
  );
  return notes.trim()
    ? `> Captions were not available for this video, so these notes come from its title and description. Ask questions below for more detail.\n\n${notes}`
    : "";
}

function summaryOf(notes: string) {
  const body = notes.replace(/^##\s*Summary\s*/i, "");
  const first = body
    .split(/\n##\s/)[0]!
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ");
  return first.slice(0, 600) || notes.slice(0, 300);
}

/**
 * Imports a video (YouTube link, direct video URL, or an uploaded file sent as a
 * data URL) and writes AI study notes for it.
 */
export async function runVideoImport(
  supabase: DB,
  userId: string,
  input: {
    url?: string | null | undefined;
    dataUrl?: string | null | undefined;
    fileName?: string | null | undefined;
    classId?: string | null | undefined;
    title?: string | null | undefined;
  },
) {
  const url = input.url?.trim() ? normalizeVideoUrl(input.url) : null;
  const dataUrl = input.dataUrl || null;
  if (!url && !dataUrl) throw new Error("Paste a video link or upload a video file first.");

  const { contextText } = await buildClassContext(supabase, userId, input.classId ?? null);

  let title = input.title?.trim() || "";
  let transcript: string | null = null;
  let sourceType = "upload";
  let notes = "";

  if (url) {
    const id = youtubeId(url);
    sourceType = id ? "youtube" : "url";
    let description: string | null = null;
    let blockedReason: string | null = null;

    if (id) {
      const yt = await youtubeTranscript(id);
      if (!title && yt.title) title = yt.title;
      transcript = yt.transcript;
      description = yt.description;
      blockedReason = yt.blockedReason;
    } else {
      const page = await pageMetadata(url);
      if (!title && page.title) title = page.title;
      description = page.description;
    }

    if (transcript) {
      notes = await noteFromTranscript(transcript, title || "Untitled video", contextText);
    } else {
      // No captions: let the model watch the link itself, then fall back to the
      // video's own title/description so the student still gets usable notes.
      try {
        notes = await noteFromMedia({ kind: "url", value: url }, title, contextText);
      } catch {
        if (description && description.length > 60) {
          notes = await noteFromDescription(title || "Untitled video", description, contextText);
        } else {
          throw new Error(
            blockedReason
              ? `YouTube would not play that video here (${blockedReason}). Try another link, or download it and upload the file.`
              : "That video has no captions and could not be read from the link. Try a different link, or download the video and upload the file here (under 24MB).",
          );
        }
      }
    }
  } else if (dataUrl) {
    if (!title) title = (input.fileName ?? "").replace(/\.[a-z0-9]+$/i, "") || "Uploaded video";
    notes = await noteFromMedia({ kind: "data", value: dataUrl }, title, contextText);
  }

  if (!notes.trim()) throw new Error("The notes came back empty. Please try again.");
  if (!title) title = "Video notes";

  const { data: row, error } = await supabase
    .from("video_notes")
    .insert({
      user_id: userId,
      class_id: input.classId ?? null,
      title: title.slice(0, 200),
      source_type: sourceType,
      source_url: url,
      transcript: transcript ? transcript.slice(0, 200_000) : null,
      notes,
      summary: summaryOf(notes),
      status: "ready",
    })
    .select("id,title")
    .single();
  if (error) throw new Error(error.message);

  // Remember the video so the tutor can use it later without re-explaining.
  await supabase.from("ai_memory").insert({
    user_id: userId,
    class_id: input.classId ?? null,
    kind: "context",
    content: `The student imported a video "${title}" into QuickVideo. Notes summary: ${summaryOf(notes).slice(0, 700)}`,
  });

  return { id: row!.id, title: row!.title, notes };
}

/** Follow-up questions about one imported video, grounded in its transcript and notes. */
export async function runVideoChat(
  supabase: DB,
  userId: string,
  input: { videoNoteId: string; message: string },
) {
  const { data: note } = await supabase
    .from("video_notes")
    .select("*")
    .eq("id", input.videoNoteId)
    .eq("user_id", userId)
    .single();
  if (!note) throw new Error("Those video notes were not found.");

  const { contextText } = await buildClassContext(supabase, userId, note.class_id);
  const history = Array.isArray(note.chat) ? (note.chat as unknown as VideoChatTurn[]) : [];

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are StudyMate AI answering questions about one specific video the student imported.",
        "Answer from the video's transcript and notes below. If the video does not cover it, say so plainly, then answer from general subject knowledge and label that clearly.",
        "Cite the [m:ss] timestamp when the transcript shows where something was said.",
        "",
        PLAIN_STYLE,
        "",
        `VIDEO: ${note.title}`,
        `NOTES:\n${(note.notes ?? "").slice(0, 12000)}`,
        note.transcript ? `TRANSCRIPT:\n${note.transcript.slice(0, 24000)}` : "",
        `STUDENT COURSE CONTEXT:\n${contextText.slice(0, 4000)}`,
      ].join("\n"),
    },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: "user", content: input.message },
  ];

  const reply = await callAI(messages, { maxTokens: 1200 });
  if (!reply.trim()) throw new Error("The AI reply came back empty. Please try again.");

  const nextChat = [
    ...history,
    { role: "user" as const, content: input.message },
    { role: "assistant" as const, content: reply },
  ].slice(-40);

  await supabase
    .from("video_notes")
    .update({ chat: nextChat as never })
    .eq("id", note.id)
    .eq("user_id", userId);

  return { reply, chat: nextChat };
}

/** Saves the student's working document (draft text and the uploaded file it came from). */
export async function runVideoWorkSave(
  supabase: DB,
  userId: string,
  input: {
    videoNoteId: string;
    draft?: string | null | undefined;
    documentId?: string | null | undefined;
    fileName?: string | null | undefined;
  },
) {
  const patch: Record<string, unknown> = {};
  if (input.draft !== undefined) patch["work_draft"] = input.draft ?? null;
  if (input.documentId !== undefined) patch["work_document_id"] = input.documentId ?? null;
  if (input.fileName !== undefined) patch["work_file_name"] = input.fileName ?? null;
  if (!Object.keys(patch).length) return { saved: false };

  const { error } = await supabase
    .from("video_notes")
    .update(patch as never)
    .eq("id", input.videoNoteId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { saved: true };
}

const WORK_MODES = {
  answer: "Answer the questions in the student's document using the video. For each question, give the answer and one short line of reasoning. Reply in markdown. Do NOT rewrite their document.",
  rewrite:
    "Rewrite the student's document so it is clearer, better organised and fully backed by the video. Keep their voice and every required part.",
  correct:
    "Correct the student's document: fix wrong facts against the video, plus grammar and spelling. Change as little as possible.",
  improve:
    "Improve and expand the student's document using details, examples and terminology from the video, without inventing anything the video does not say.",
} as const;

export type VideoWorkMode = keyof typeof WORK_MODES;

/**
 * Helps the student with their own assignment document, grounded in the imported
 * video. "answer" replies with guidance; the other modes return the edited document.
 */
export async function runVideoWork(
  supabase: DB,
  userId: string,
  input: {
    videoNoteId: string;
    mode: VideoWorkMode;
    draft: string;
    instruction?: string | null | undefined;
  },
) {
  const { data: note } = await supabase
    .from("video_notes")
    .select("*")
    .eq("id", input.videoNoteId)
    .eq("user_id", userId)
    .single();
  if (!note) throw new Error("Those video notes were not found.");

  let uploaded = "";
  const docId = (note as { work_document_id?: string | null }).work_document_id ?? null;
  if (docId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_name,extracted_text")
      .eq("id", docId)
      .eq("user_id", userId)
      .single();
    if (doc?.extracted_text) {
      uploaded = `UPLOADED ASSIGNMENT FILE (${doc.file_name}):\n${doc.extracted_text.slice(0, 14000)}`;
    }
  }

  const editing = input.mode !== "answer";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are StudyMate AI helping a college student with their own assignment, using a video they imported.",
        WORK_MODES[input.mode],
        editing
          ? "Return ONLY the finished document text — no preamble, no commentary, no code fences. Keep it in the same format the student used."
          : PLAIN_STYLE,
        editing ? "Length: whatever the document needs." : "",
        "",
        `VIDEO: ${note.title}`,
        `VIDEO NOTES:\n${(note.notes ?? "").slice(0, 10000)}`,
        note.transcript ? `VIDEO TRANSCRIPT:\n${note.transcript.slice(0, 20000)}` : "",
        uploaded,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        input.instruction?.trim() ? `My instructions: ${input.instruction.trim()}` : "",
        `MY DOCUMENT:\n${input.draft.slice(0, 20000)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  const reply = (await callAI(messages, { maxTokens: editing ? 2600 : 1400, temperature: 0.3 })).trim();
  if (!reply) throw new Error("The AI reply came back empty. Please try again.");

  if (editing) {
    const cleaned = reply.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    await supabase
      .from("video_notes")
      .update({ work_draft: cleaned } as never)
      .eq("id", note.id)
      .eq("user_id", userId);
    return { mode: input.mode, draft: cleaned, reply: null as string | null };
  }
  return { mode: input.mode, draft: null as string | null, reply };
}
