import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_TYPES = new Set(["text", "search", "", "url"]);
function voiceTarget(el: EventTarget | null): Field | null {
  if (!(el instanceof HTMLElement) || el.closest("[data-no-voice]")) return null;
  if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled ? el : null;
  if (el.isContentEditable) return (el.closest("[contenteditable='true']") as HTMLElement) ?? el;
  return null;
}

/** Inserts text so React-controlled fields and rich editors both update. */
function insertInto(el: Field, text: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const piece = (before && !/\s$/.test(before) ? " " : "") + text;
    const next = before + piece + el.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const pos = start + piece.length; try { el.setSelectionRange(pos, pos); } catch { /* not selectable */ }
  } else {
    el.focus();
    document.execCommand("insertText", false, " " + text);
  }
}

/** One floating mic that appears beside whatever text box is focused, anywhere in the app. Free browser speech recognition. */
export function GlobalVoiceTyping() {
  const [field, setField] = useState<Field | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const target = useRef<Field | null>(null);

  const stop = () => { want.current = false; rec.current?.stop(); setOn(false); };

  useEffect(() => {
    const onIn = (e: FocusEvent) => { const t = voiceTarget(e.target); if (t) { if (target.current && t !== target.current) stop(); target.current = t; setField(t); setRect(t.getBoundingClientRect()); } };
    const onOut = () => setTimeout(() => { const t = voiceTarget(document.activeElement); if (!t) { stop(); setField(null); target.current = null; } }, 150);
    const reflow = () => { if (target.current) setRect(target.current.getBoundingClientRect()); };
    document.addEventListener("focusin", onIn); document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", reflow, true); window.addEventListener("resize", reflow);
    const iv = setInterval(reflow, 500);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); window.removeEventListener("scroll", reflow, true); window.removeEventListener("resize", reflow); clearInterval(iv); stop(); };
  }, []);

  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) { toast.error("Voice typing isn't supported in this browser. Try Chrome, Edge, or Safari."); return; }
    const r = new C();
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]!; const t = res[0].transcript.trim(); if (res.isFinal && t && target.current) insertInto(target.current, t); } };
    r.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { want.current = false; toast.error("Allow microphone access to use voice typing."); } };
    r.onend = () => { if (want.current) { try { r.start(); } catch { setOn(false); } } else setOn(false); };
    rec.current = r; want.current = true;
    try { r.start(); setOn(true); toast.success("Listening… speak now"); } catch { setOn(false); }
  };

  if (!field || !rect || rect.width === 0) return null;
  const big = field instanceof HTMLTextAreaElement || !(field instanceof HTMLInputElement);
  const size = 32;
  const top = big ? Math.max(4, Math.min(rect.bottom - size - 6, window.innerHeight - size - 8)) : rect.top + (rect.height - size) / 2;
  const left = Math.min(rect.right - size - 6, window.innerWidth - size - 8);
  if (rect.bottom < 0 || rect.top > window.innerHeight) return null;

  return (
    <button type="button" data-no-voice aria-label={on ? "Stop voice typing" : "Voice typing — speak to type"} title={on ? "Stop voice typing" : "Speak to type"} aria-pressed={on}
      onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={on ? stop : start}
      style={{ position: "fixed", top, left, width: size, height: size, zIndex: 100 }}
      className={cn("flex items-center justify-center rounded-full border border-border shadow-card transition", on ? "animate-pulse bg-primary text-primary-foreground" : "bg-card/90 text-muted-foreground hover:text-foreground")}>
      {on ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </button>
  );
}
