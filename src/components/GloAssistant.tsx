import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, X, Check } from "lucide-react";
import { MascotFace } from "@/components/ToolsMascot";
import { gloCommand, type GloAction } from "@/lib/glo.functions";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type Mode = "idle" | "listening" | "thinking" | "speaking";
const KEY = "studynova:glo-wake";
const WAKE = /\b(hey|hi|okay|ok)[,\s]+(glo|glow|glo's|flo|blow|clo)\b[,.!?\s]*/i;
const YES = /^(yes|yeah|yep|sure|send( it)?|do it|ok(ay)?)\b/i;
const NO = /^(no|nope|cancel|stop|don'?t)\b/i;

/** Glo: always-on "Hey Glo" voice assistant that sits on the right edge. */
export function GloAssistant() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const ask = useServerFn(gloCommand);

  const [wakeOn, setWakeOn] = useState(true);
  const [mode, setMode] = useState<Mode>("idle");
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState<Extract<GloAction, { type: "email" }> | null>(null);

  const rec = useRef<Rec | null>(null);
  const awake = useRef(false);
  const speaking = useRef(false);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const ctx = useRef({ path, theme, toggle, navigate }); ctx.current = { path, theme, toggle, navigate };
  const name = (profile?.name ?? "").split(" ")[0] || "there";

  useEffect(() => { setWakeOn(localStorage.getItem(KEY) !== "0"); }, []);

  const say = useCallback((text: string, then?: () => void) => {
    setCaption(text);
    const synth = window.speechSynthesis;
    if (!synth) { then?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speaking.current = true; setMode("speaking");
    u.onend = u.onerror = () => { speaking.current = false; setMode(awake.current ? "listening" : "idle"); then?.(); };
    synth.speak(u);
  }, []);

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
    const p = pendingRef.current;
    if (p) {
      if (YES.test(text)) return sendEmail(p);
      if (NO.test(text)) { setPending(null); return say("Okay, I won't send it."); }
    }
    awake.current = false;
    setMode("thinking"); setCaption(`“${text}”`);
    try {
      const r = await ask({ data: { text, path: ctx.current.path, history: history.current.slice(-6) } });
      history.current.push({ role: "user", content: text }, { role: "assistant", content: r.say });
      runAction(r.action);
      if (r.action.type === "email") awake.current = true; // listen for "yes"
      say(r.say);
    } catch (e) {
      say(e instanceof Error ? e.message.slice(0, 200) : "Sorry, something went wrong.");
    }
  }, [ask, runAction, say, sendEmail]);

  const wake = useCallback((rest = "") => {
    setOpen(true);
    if (rest.trim().length > 3) { void handle(rest.trim()); return; }
    awake.current = true;
    say(`Hey ${name}, how can I help you?`);
  }, [handle, name, say]);

  // Always-on recognizer (paused while Glo is talking so he doesn't hear himself).
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C || !wakeOn) return;
    let alive = true;
    const r = new C();
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      if (speaking.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (!res.isFinal) continue;
        const t = res[0].transcript.trim();
        const m = t.match(WAKE);
        if (m) wake(t.slice((m.index ?? 0) + m[0].length));
        else if (awake.current && t) void handle(t);
      }
    };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") alive = false; };
    r.onend = () => { if (alive) setTimeout(() => { try { r.start(); } catch { /* already running */ } }, 300); };
    rec.current = r;
    try { r.start(); } catch { /* needs a tap first */ }
    const retry = () => { try { r.start(); } catch { /* running */ } };
    window.addEventListener("pointerdown", retry, { once: true });
    return () => { alive = false; window.removeEventListener("pointerdown", retry); r.abort(); };
  }, [wakeOn, wake, handle]);

  const toggleWake = () => {
    const next = !wakeOn;
    localStorage.setItem(KEY, next ? "1" : "0");
    setWakeOn(next);
  };

  return (
    <div className="pointer-events-none fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 in-data-[help=open]:hidden">
      {open ? (
        <div className="pointer-events-auto w-64 rounded-l-2xl border border-r-0 border-primary/40 bg-card/95 p-3 text-sm shadow-[var(--shadow-float)] backdrop-blur animate-in slide-in-from-right-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-xs font-extrabold uppercase tracking-wider text-primary">
              Glo · {mode === "thinking" ? "thinking…" : mode === "speaking" ? "talking" : mode === "listening" ? "listening" : wakeOn ? "say “Hey Glo”" : "wake word off"}
            </span>
            <button type="button" aria-label="Close Glo" onClick={() => { setOpen(false); awake.current = false; window.speechSynthesis?.cancel(); }} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <p className="max-h-40 overflow-y-auto text-foreground scroll-slim">{caption || "Ask me what's due, to make a note, open quizzes, draft an email…"}</p>
          {pending ? (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => sendEmail(pending)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground"><Check className="size-3.5" /> Send</button>
              <button type="button" onClick={() => { setPending(null); say("Okay, cancelled."); }} className="flex-1 rounded-lg bg-muted px-2 py-1.5 text-xs font-bold text-muted-foreground">Cancel</button>
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button type="button" onClick={() => wake()} className="flex items-center gap-1 text-xs font-bold text-primary"><Mic className="size-3.5" /> Talk</button>
            <button type="button" onClick={toggleWake} aria-pressed={wakeOn} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {wakeOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />} “Hey Glo” {wakeOn ? "on" : "off"}
            </button>
          </div>
          <Link to="/glo" className="mt-1.5 block text-center text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
            What can Glo do? →
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Open Glo"
        data-tour="glo"
        onClick={() => (open ? wake() : setOpen(true))}
        className={cn(
          "pointer-events-auto relative mr-1 flex size-10 items-center justify-center rounded-full bg-primary shadow-[0_0_18px_var(--primary)] transition-transform",
          mode !== "idle" && "scale-110 animate-pulse",
          !open && "opacity-80 hover:opacity-100",
        )}
      >
        <span className="scale-75"><MascotFace /></span>
      </button>
    </div>
  );
}
