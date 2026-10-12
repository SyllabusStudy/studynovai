import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, X, Check, MonitorUp, MonitorX, LoaderCircle, AudioLines, Send, Square } from "lucide-react";
import { MascotFace } from "@/components/ToolsMascot";
import { Button } from "@/components/ui/button";
import { createGloSpeechGate, GLO_SILENCE_MS } from "@/lib/glo-speech";
import { gloCommand, transcribeGloVoice, type GloAction } from "@/lib/glo.functions";
import { addGloLog, describeGloAction } from "@/lib/glo-log";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useMicBusy } from "@/lib/mic-busy";
import { AI_CONNECTION_MESSAGE } from "@/lib/ai-messages";
import { GloDesktopButton } from "@/components/GloDesktopDialog";

type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type Mode = "idle" | "listening" | "hearing" | "preparing" | "thinking" | "speaking";
const KEY = "studynova:glo-wake";
const WAKE = /\b(hey|hi|okay|ok)[,\s]+(glo|glow|glo's|flo|blow|clo)\b[,.!?\s]*/i;
const YES = /^(yes|yeah|yep|sure|send( it)?|do it|ok(ay)?)\b/i;
const LOOK = /\b(look at|see|watch|share|view)\b.*\bscreen\b/i;
const STOP_WATCH = /\bstop (watching|looking|seeing)|stop (the )?screen\b/i;
const NO = /^(no|nope|cancel|stop|don'?t)\b/i;
const BYE = /\b(thank(s| you)\b.*\b(glo|glow|help|helping)|(ok(ay)?|bye),?\s*(glo|glow)\b.*\b(thank|bye)|that'?s all|goodbye|bye (glo|glow)|stop listening)/i;
const GO = /\b(take me|go to|open|show me|navigate|bring me|switch to)\b/i;
const IDLE_MS = 25000;
const VOICE_KEY = "studynova:glo-voice";
// iOS ships joke/novelty voices (Bells, Bubbles, Zarvox…) that sound robotic or silly.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy)\b/i;
function pickVoice(): SpeechSynthesisVoice | undefined {
  const vs = (window.speechSynthesis?.getVoices() ?? []).filter((v) => !NOVELTY.test(v.name));
  const saved = localStorage.getItem(VOICE_KEY);
  const chosen = saved && vs.find((v) => v.name === saved);
  if (chosen) return chosen;
  const lang = (navigator.language || "en-US").slice(0, 2);
  const pool = vs.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const rank = [/natural/i, /neural/i, /premium/i, /enhanced/i, /siri/i, /\b(ava|samantha|nora|zoe|allison|aria|jenny|karen|daniel|moira)\b/i, /google us english/i, /google/i];
  for (const r of rank) { const v = pool.find((x) => r.test(x.name)); if (v) return v; }
  return pool.find((v) => v.localService) ?? pool[0];
}

/** Glo: always-on "Hey Glo" voice assistant that sits on the right edge. */
export function GloAssistant() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const ask = useServerFn(gloCommand);

  const [wakeOn, setWakeOn] = useState(true);
  const micBusy = useMicBusy();
  const listenOn = wakeOn && !micBusy;
  const [mode, setMode] = useState<Mode>("idle");
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const acceptSpeech = useRef(createGloSpeechGate());
  const [pending, setPending] = useState<Extract<GloAction, { type: "email" }> | null>(null);
  const transcribe = useServerFn(transcribeGloVoice);
  const [noWakeWord, setNoWakeWord] = useState(false);
  const [micState, setMicState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [typed, setTyped] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const recTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [watching, setWatching] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const rec = useRef<Rec | null>(null);
  const awake = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAwake = () => {
    awake.current = true;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { if (!speaking.current) { awake.current = false; setMode("idle"); } }, IDLE_MS);
  };
  const speaking = useRef(false);
  const thinking = useRef(false);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const ctx = useRef({ path, theme, toggle, navigate }); ctx.current = { path, theme, toggle, navigate };
  const name = (profile?.name ?? "").split(" ")[0] || "there";

  useEffect(() => { setWakeOn(localStorage.getItem(KEY) !== "0"); }, []);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      const lang = (navigator.language || "en-US").slice(0, 2);
      const list = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang) && !NOVELTY.test(v.name));
      setVoices(list);
      setVoiceName(pickVoice()?.name ?? "");
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  const say = useCallback((text: string, then?: () => void) => {
    setCaption(text);
    const synth = window.speechSynthesis;
    if (!synth) { then?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1; u.pitch = 1;
    speaking.current = true; setMode("speaking");
    u.onend = u.onerror = () => { speaking.current = false; setMode(awake.current ? "listening" : "idle"); then?.(); };
    synth.speak(u);
  }, []);

  const stopWatching = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setWatching(false);
  }, []);

  const startWatching = useCallback(async () => {
    if (stream.current) return true;
    if (!navigator.mediaDevices?.getDisplayMedia) { say("Sorry, this browser can't share your screen with me."); return false; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.current = s;
      if (!video.current) { video.current = document.createElement("video"); video.current.muted = true; video.current.playsInline = true; }
      video.current.srcObject = s;
      await video.current.play();
      s.getVideoTracks()[0]?.addEventListener("ended", () => stopWatching());
      setWatching(true); setOpen(true);
      return true;
    } catch {
      say("Okay, I won't look at your screen.");
      return false;
    }
  }, [say, stopWatching]);

  const snapshot = useCallback((): string | undefined => {
    const v = video.current;
    if (!stream.current || !v || !v.videoWidth) return undefined;
    const scale = Math.min(1, 1024 / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.75);
  }, []);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  // Ctrl+V anywhere (outside text boxes) hands a screenshot straight to Glo.
  const [pasted, setPasted] = useState<string | null>(null);
  const pastedRef = useRef<string | null>(null);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1280 / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const data = c.toDataURL("image/jpeg", 0.8);
        pastedRef.current = data; setPasted(data); setOpen(true);
        awake.current = true;
        say("Got your screenshot! Ask me about it, or tap a button.", keepAwake);
      };
      img.src = url;
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [say]);

  const runAction = useCallback((a: GloAction) => {
    const c = ctx.current;
    if (a.type === "navigate" && a.to !== c.path) c.navigate({ to: a.to });
    if (a.type === "theme" && a.mode !== c.theme) c.toggle();
    if (a.type === "email") setPending(a);
  }, []);

  const sendEmail = useCallback((a: Extract<GloAction, { type: "email" }>) => {
    setPending(null);
    window.location.href = `mailto:${encodeURIComponent(a.to)}?subject=${encodeURIComponent(a.subject)}&body=${encodeURIComponent(a.body)}`;
    say("Opening it in your email app to send.");
  }, [say]);

  const handle = useCallback(async (text: string) => {
    // One request at a time: overlapping requests cut each other off and hit free-key rate limits.
    if (thinking.current || speaking.current || micBusy) return;
    if (BYE.test(text)) { awake.current = false; if (idle.current) clearTimeout(idle.current); return say(`You're welcome, ${name}! Just say "Hey Glo" when you need me.`); }
    const p = pendingRef.current;
    if (p) {
      if (YES.test(text)) return sendEmail(p);
      if (NO.test(text)) { setPending(null); return say("Okay, I won't send it."); }
    }
    if (STOP_WATCH.test(text)) { awake.current = false; stopWatching(); return say("Okay, I stopped watching your screen."); }
    if (LOOK.test(text) && !stream.current) {
      const ok = await startWatching();
      if (!ok) return;
      if (text.replace(LOOK, "").trim().length < 4) { awake.current = true; return say("I can see your screen now. What would you like to know?"); }
    }
    keepAwake();
    thinking.current = true;
    setMode("thinking"); setTranscript(text); setOpen(true);
    try {
      const screen = pastedRef.current ?? snapshot();
      if (pastedRef.current) { pastedRef.current = null; setPasted(null); }
      const payload = { data: { text, path: ctx.current.path, history: history.current.slice(-6), screen } };
      let r: Awaited<ReturnType<typeof ask>>;
      try {
        r = await ask(payload);
      } catch (e) {
        // One quiet retry for a dropped connection before telling the student.
        const msg = e instanceof Error ? e.message : "";
        if (!(msg === AI_CONNECTION_MESSAGE || /fetch|network|load failed|aborted/i.test(msg))) throw e;
        await new Promise((res) => setTimeout(res, 2000));
        r = await ask(payload);
      }
      history.current.push({ role: "user", content: text }, { role: "assistant", content: r.say });
      addGloLog({ at: Date.now(), asked: text, said: r.say, action: describeGloAction(r.action as { type: string }) });
      // Work happens in the background; only change pages when explicitly asked.
      if (r.action.type !== "navigate" || GO.test(text)) runAction(r.action);
      thinking.current = false;
      if ("endSession" in r && r.endSession) {
        awake.current = false;
        if (idle.current) clearTimeout(idle.current);
        say(r.say);
      } else {
        say(r.say, keepAwake);
      }
    } catch (e) {
      thinking.current = false;
      say(e instanceof Error ? e.message.slice(0, 200) : "Sorry, something went wrong.");
    }
  }, [ask, runAction, say, sendEmail, startWatching, stopWatching, snapshot, name, micBusy]);

  const wake = useCallback((rest = "") => {
    if (thinking.current || speaking.current || micBusy) return;
    setOpen(true);
    if (rest.trim().length > 3) { void handle(rest.trim()); return; }
    keepAwake();
    say(`Hey ${name}, how can I help you?`, keepAwake);
  }, [handle, name, say, micBusy]);

  // Always-on recognizer (paused while Glo is talking so he doesn't hear himself).
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C || !listenOn || noWakeWord) return;
    let alive = true;
    const r = new C();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    // Wait for a real 2-second pause so Glo never cuts the student off mid-sentence.
    // Everything heard since the last send is joined into one sentence and sent once.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    let base = 0;
    let heard = "";
    const fire = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
      const t = heard.trim();
      heard = "";
      const n = t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      if (!n || thinking.current || speaking.current) return;
      if (!WAKE.test(t) && n.split(/\s+/).length < 2 && !YES.test(t) && !NO.test(t)) return;
      const m = t.match(WAKE);
      if (!m && !awake.current) return;
      if (!acceptSpeech.current(t, thinking.current || speaking.current, Date.now())) {
        setMode(awake.current ? "listening" : "idle");
        return;
      }
      if (m) wake(t.slice((m.index ?? 0) + m[0].length));
      else if (awake.current) void handle(t);
    };
    r.onresult = (e) => {
      // Ignore anything heard while Glo is thinking or talking, and don't carry it over.
      if (speaking.current || thinking.current) { base = e.results.length; heard = ""; if (timer) { clearTimeout(timer); timer = null; } return; }
      if (base > e.results.length) base = 0;
      const parts: string[] = [];
      for (let i = base; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        const conf = (res[0] as { confidence?: number }).confidence ?? 1;
        // Background noise filter: drop faint/unclear finished phrases.
        if (res.isFinal && conf > 0 && conf < 0.55) continue;
        parts.push(res[0].transcript.trim());
      }
      heard = parts.filter(Boolean).join(" ");
      if (!heard) return;
      if (feedbackTimer) clearTimeout(feedbackTimer);
      if (awake.current || WAKE.test(heard)) {
        if (idle.current) clearTimeout(idle.current);
        setTranscript(heard); setMode("hearing"); setOpen(true);
        feedbackTimer = setTimeout(() => {
          if (!thinking.current && !speaking.current) setMode("preparing");
        }, 400);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { base = e.results.length; fire(); }, GLO_SILENCE_MS);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") { alive = false; setMicState("denied"); }
      // The desktop app (and some browsers) have no speech service: switch to tap-to-talk recording.
      if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") { alive = false; setNoWakeWord(true); }
    };
    r.onend = () => { base = 0; if (alive) setTimeout(() => { try { r.start(); } catch { /* already running */ } }, 300); };
    rec.current = r;
    const start = () => { try { r.start(); } catch { /* running */ } };
    // Only auto-start if the mic was already allowed; otherwise wait for a tap
    // so the browser asks once and remembers "Allow while visiting".
    const begin = (granted: boolean) => {
      if (!alive) return;
      if (granted) start();
      else window.addEventListener("pointerdown", start, { once: true });
    };
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    if (perms) {
      perms.query({ name: "microphone" }).then((p) => begin(p.state === "granted")).catch(() => begin(false));
    } else begin(false);
    return () => { alive = false; if (timer) clearTimeout(timer); if (feedbackTimer) clearTimeout(feedbackTimer); window.removeEventListener("pointerdown", start); r.abort(); };
  }, [listenOn, wake, handle, noWakeWord]);

  // Watch the microphone permission so Glo can say clearly when it's blocked.
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    if (!(w.SpeechRecognition ?? w.webkitSpeechRecognition) || /Electron/i.test(navigator.userAgent)) setNoWakeWord(true);
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string; onchange: (() => void) | null }> } }).permissions;
    perms?.query({ name: "microphone" }).then((p) => {
      const sync = () => setMicState(p.state === "granted" ? "granted" : p.state === "denied" ? "denied" : "prompt");
      sync(); p.onchange = sync;
    }).catch(() => {});
  }, []);

  /** Tap-to-talk: records with the real microphone and transcribes it (works in the desktop app). */
  const startRecording = useCallback(async () => {
    if (recorder.current || thinking.current || speaking.current || micBusy) return;
    window.speechSynthesis?.cancel();
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      setMicState("granted");
    } catch {
      setMicState("denied"); setOpen(true);
      setCaption("Your microphone is blocked. Allow it in your browser or computer settings (Windows: Settings → Privacy → Microphone), then tap Talk again. You can also type to me below.");
      return;
    }
    const chunks: Blob[] = [];
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(media, { audioBitsPerSecond: 32000 }); } catch { mr = new MediaRecorder(media); }
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      media.getTracks().forEach((t) => t.stop());
      recorder.current = null; setRecording(false);
      if (recTimer.current) clearTimeout(recTimer.current);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (blob.size < 2000) return;
      setTranscribing(true);
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const { text } = await transcribe({ data: { audio: btoa(bin), mimeType: blob.type } });
        setTranscribing(false);
        if (text) void handle(text);
        else say("I didn't catch that. Tap Talk and try again, or type it below.");
      } catch (e) {
        setTranscribing(false);
        say(e instanceof Error ? e.message.slice(0, 200) : "I couldn't hear that. Try typing it below.");
      }
    };
    mr.start(500);
    recorder.current = mr; setRecording(true); setOpen(true); setCaption("I'm listening… tap Stop when you're done.");
    recTimer.current = setTimeout(() => recorder.current?.stop(), 30000);
    // Auto-stop after ~2.5s of silence once the student has started speaking.
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(an);
      const data = new Uint8Array(an.fftSize); let spoke = false; let quietSince = 0;
      const tick = () => {
        if (mr.state !== "recording") { void ctx.close(); return; }
        an.getByteTimeDomainData(data);
        let sum = 0; for (const v of data) sum += (v - 128) ** 2;
        const loud = Math.sqrt(sum / data.length) > 6; const now = performance.now();
        if (loud) { spoke = true; quietSince = 0; } else if (spoke) { quietSince ||= now; if (now - quietSince > 2500) { mr.stop(); void ctx.close(); return; } }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { /* manual Stop still works */ }
  }, [micBusy, transcribe, handle, say]);
  const stopRecording = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };

  const talk = () => {
    if (recording) return stopRecording();
    window.speechSynthesis?.cancel(); speaking.current = false;
    void startRecording();
  };

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const t = typed.trim();
    if (!t || processing || recording || transcribing) return;
    setTyped("");
    if (BYE.test(t) || awake.current) void handle(t); else { keepAwake(); void handle(t); }
  };

  // Quiet mode while a lecture is recording: stop talking and forget the open conversation.
  useEffect(() => {
    if (!micBusy) return;
    window.speechSynthesis?.cancel(); speaking.current = false; awake.current = false;
    if (idle.current) clearTimeout(idle.current);
    setMode("idle");
  }, [micBusy]);

  const toggleWake = () => {
    const next = !wakeOn;
    localStorage.setItem(KEY, next ? "1" : "0");
    setWakeOn(next);
  };

  const processing = mode === "thinking";
  const showingTranscript = mode === "hearing" || mode === "preparing" || processing;
  const recordingStatus = recording ? "Recording · tap Stop when done" : transcribing ? "Got it · reading your voice…" : "";
  const micStatus = micState === "denied" ? "Microphone blocked — tap to enable" : micState === "prompt" && wakeOn && !noWakeWord ? "Tap Talk to allow the microphone" : "";
  const status = micBusy ? "Quiet · recording lecture" : recordingStatus || (processing ? "Got it · preparing your answer" : mode === "preparing" ? "Heard you · finishing up…" : mode === "hearing" ? "Hearing you…" : mode === "speaking" ? "Speaking" : micStatus || (mode === "listening" ? "Ready for your next question" : noWakeWord ? "Tap Talk or type below" : wakeOn ? "Say “Hey Glo”" : "Wake word off"));

  return (
    <div className={cn("pointer-events-none fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 in-data-[help=open]:hidden", path !== "/dashboard" && !open && "max-md:hidden")}>
      {open ? (
        <div className="pointer-events-auto w-64 rounded-l-2xl border border-r-0 border-primary/40 bg-card/95 p-3 text-sm shadow-[var(--shadow-float)] backdrop-blur animate-in slide-in-from-right-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-sm font-bold text-foreground">
              Glo
            </span>
            <button type="button" aria-label="Close Glo" onClick={() => { setOpen(false); awake.current = false; window.speechSynthesis?.cancel(); }} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div role="status" aria-live="polite" onClick={micState === "denied" ? () => void startRecording() : undefined} className={cn("mb-2 flex min-h-8 items-center gap-2 text-xs font-semibold", micState === "denied" && !micBusy ? "cursor-pointer text-destructive" : "text-info")}>
            {processing ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" /> : showingTranscript || mode === "speaking" ? <AudioLines className="size-4 shrink-0" /> : <span className="size-1.5 shrink-0 rounded-full bg-success" />}
            <span>{status}</span>
          </div>
          {watching ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/50 bg-primary/15 px-2 py-1 text-xs font-bold text-primary shadow-[0_0_12px_var(--primary)]">
              <span className="flex items-center gap-1.5"><span className="size-2 animate-pulse rounded-full bg-primary" /> Glo can see your screen</span>
              <button type="button" onClick={() => { stopWatching(); say("Okay, I stopped watching."); }} className="rounded-md bg-primary px-2 py-0.5 text-primary-foreground">Stop</button>
            </div>
          ) : null}
          {pasted ? (
            <div className="mb-2 rounded-lg border border-primary/40 bg-primary/10 p-1.5">
              <div className="relative">
                <img src={pasted} alt="Pasted screenshot" className="max-h-28 w-full rounded-md object-contain" />
                <button type="button" aria-label="Remove screenshot" onClick={() => { pastedRef.current = null; setPasted(null); }} className="absolute right-1 top-1 rounded-full bg-card p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" disabled={processing} onClick={() => void handle("Explain what's in this screenshot step by step.")} className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">Explain</button>
                <button type="button" disabled={processing} onClick={() => void handle("Take notes on this screenshot.")} className="flex-1 rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground">Take notes</button>
              </div>
            </div>
          ) : null}
          <p className="min-h-12 max-h-40 overflow-y-auto break-words text-foreground scroll-slim">{showingTranscript ? `“${transcript}”` : caption || "Hey! What’s on your mind?"}</p>
          <form onSubmit={submitTyped} data-no-voice className="mt-2 flex items-center gap-1.5">
            <input data-no-voice value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to Glo…" aria-label="Type a message to Glo" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <button type="submit" aria-label="Send to Glo" disabled={!typed.trim() || processing || recording || transcribing} className="rounded-lg bg-primary p-1.5 text-primary-foreground disabled:opacity-50"><Send className="size-3.5" /></button>
          </form>
          {pending ? (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => sendEmail(pending)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground"><Check className="size-3.5" /> Send</button>
              <button type="button" onClick={() => { setPending(null); say("Okay, cancelled."); }} className="flex-1 rounded-lg bg-muted px-2 py-1.5 text-xs font-bold text-muted-foreground">Cancel</button>
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Button type="button" variant={recording ? "default" : "ghost"} size="sm" disabled={(!recording && (processing || transcribing || mode === "speaking")) || micBusy} onClick={talk} className={cn("h-7 gap-1 px-1.5 text-xs font-bold", recording ? "animate-pulse" : "text-primary")}>{recording ? <><Square className="size-3.5" /> Stop</> : <><Mic className="size-3.5" /> Talk</>}</Button>
            <button type="button" onClick={() => (watching ? stopWatching() : void startWatching().then((ok) => { if (ok) { awake.current = true; say("I can see your screen now. What would you like to know?"); } }))} className="flex items-center gap-1 text-xs font-bold text-primary">
              {watching ? <MonitorX className="size-3.5" /> : <MonitorUp className="size-3.5" />} {watching ? "Stop" : "Share screen"}
            </button>
            <button type="button" onClick={toggleWake} aria-pressed={wakeOn} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {wakeOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />} “Hey Glo” {wakeOn ? "on" : "off"}
            </button>
          </div>
          {voices.length ? (
            <div className="mt-2 flex items-center gap-1.5">
              <select aria-label="Glo's voice" value={voiceName} onChange={(e) => { localStorage.setItem(VOICE_KEY, e.target.value); setVoiceName(e.target.value); say(`Hi ${name}, this is how I sound now.`); }} className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground">
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name.replace(/^(Microsoft|Google)\s*/, "")}</option>)}
              </select>
              <button type="button" onClick={() => say(`Hi ${name}, this is how I sound.`)} className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground">Test</button>
            </div>
          ) : null}
          <div className="mt-1.5 flex justify-center gap-3 text-[11px] font-semibold text-muted-foreground">
            <Link to="/glo-active" className="hover:text-primary hover:underline">Glo Active</Link>
            <Link to="/glo" className="hover:text-primary hover:underline">What can Glo do? →</Link>
          </div>
          <div className="mt-1.5 flex justify-center"><GloDesktopButton /></div>
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        aria-label="Open Glo"
        aria-expanded={open}
        title={processing ? "Glo heard you · preparing your answer" : "Talk to Glo"}
        data-tour="glo"
        data-state={mode}
        onClick={() => setOpen((value) => !value)}
        className="glo-launcher pointer-events-auto relative mr-2 flex h-[72px] w-14 shrink-0 flex-col gap-0 rounded-2xl p-0 transition-transform hover:-translate-x-1"
      >
        <span className="glo-face relative flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-7"><MascotFace /></span>
        <span className="mt-1 font-display text-[10px] font-bold">GLO</span>
        <span aria-hidden="true" className="glo-meter absolute -bottom-1 flex h-3 items-center gap-0.5 rounded-full border border-border bg-card px-1.5">
          <i /><i /><i /><i /><i />
        </span>
        {watching ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success" aria-label="Glo can see your screen" /> : null}
      </Button>
    </div>
  );
}
