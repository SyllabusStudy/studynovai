import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PLAIN_STYLE, buildClassContext, callAI, type ChatMessage } from "./ai.server";

type DB = SupabaseClient<Database>;

export type VideoChatTurn = { role: "user" | "assistant"; content: string };

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (!host.endsWith("youtube.com")) return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
    return m?.[2] ?? null;
  } catch {
    return null;
  }
}

/** Pulls YouTube's own caption track and flattens it to plain text. */
type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

/** Reads the video's title and caption tracks from YouTube's player API. */
async function youtubePlayer(
  videoId: string,
): Promise<{ title: string | null; tracks: CaptionTrack[] }> {
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
      body: JSON.stringify({
        context: {
          client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", androidSdkVersion: 34 },
        },
        videoId,
      }),
    });
    const body = await res.text();
    if (!body.trim()) return { title: null, tracks: [] };
    const json = JSON.parse(body) as {
      videoDetails?: { title?: string };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
    };
    return {
      title: json.videoDetails?.title?.trim() ?? null,
      tracks: json.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
    };
  } catch {
    return { title: null, tracks: [] };
  }
}

/** Pulls YouTube's own caption track and flattens it to timestamped plain text. */
async function youtubeTranscript(
  videoId: string,
): Promise<{ title: string | null; transcript: string | null }> {
  const { title, tracks } = await youtubePlayer(videoId);
  const track =
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0];
  if (!track?.baseUrl) return { title, transcript: null };

  try {
    const res = await fetch(`${track.baseUrl.replace(/&fmt=\w+/, "")}&fmt=json3`, {
      headers: { "User-Agent": ANDROID_UA },
    });
    const body = await res.text();
    if (!body.trim()) return { title, transcript: null };
    const parsed = JSON.parse(body) as {
      events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
    };
    const lines = (parsed.events ?? [])
      .map((e) => {
        const text = (e.segs ?? [])
          .map((s) => s.utf8 ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) return null;
        const total = Math.round((e.tStartMs ?? 0) / 1000);
        const stamp = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
        return `[${stamp}] ${text}`;
      })
      .filter(Boolean) as string[];
    const transcript = lines.join("\n").trim();
    return { title, transcript: transcript.length > 40 ? transcript : null };
  } catch {
    return { title, transcript: null };
  }
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
  const url = input.url?.trim() || null;
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
    if (id) {
      const yt = await youtubeTranscript(id);
      if (!title && yt.title) title = yt.title;
      transcript = yt.transcript;
    }
    if (transcript) {
      notes = await noteFromTranscript(transcript, title || "Untitled video", contextText);
    } else {
      try {
        notes = await noteFromMedia({ kind: "url", value: url }, title, contextText);
      } catch (e) {
        throw new Error(
          id
            ? "That YouTube video has no captions available and could not be watched directly. Try another video, or download it and upload the file here."
            : `That video link could not be read: ${e instanceof Error ? e.message : "unknown error"}`,
        );
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
