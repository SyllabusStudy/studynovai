import { useSyncExternalStore } from "react";

/**
 * App-wide lecture recorder. Lives outside any page so recording keeps going
 * while the student switches to other tools/tabs.
 */
export const MAX_RECORD_SECONDS = 60 * 60;

type State = { recording: boolean; seconds: number; pending: { blob: Blob; name: string } | null };

let state: State = { recording: false, seconds: 0, pending: null };
const listeners = new Set<() => void>();
let rec: MediaRecorder | null = null;
let timer: number | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useLectureRecorder() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export async function startLectureRecording() {
  if (state.recording) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const chunks: Blob[] = [];
  let mr: MediaRecorder;
  try {
    mr = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
  } catch {
    mr = new MediaRecorder(stream);
  }
  mr.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  mr.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    set({
      pending: { blob: new Blob(chunks, { type: mr.mimeType || "audio/webm" }), name: `Lecture ${new Date().toLocaleDateString()}` },
    });
  };
  mr.start(1000);
  rec = mr;
  set({ recording: true, seconds: 0, pending: null });
  timer = window.setInterval(() => {
    const s = state.seconds + 1;
    set({ seconds: s });
    if (s >= MAX_RECORD_SECONDS) stopLectureRecording();
  }, 1000);
}

export function stopLectureRecording() {
  if (rec && rec.state !== "inactive") rec.stop();
  rec = null;
  if (timer) window.clearInterval(timer);
  timer = null;
  set({ recording: false });
}

/** Hands the finished recording to whoever will turn it into notes (once). */
export function takePendingRecording() {
  const p = state.pending;
  if (p) set({ pending: null });
  return p;
}
