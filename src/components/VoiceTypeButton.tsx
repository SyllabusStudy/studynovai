import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** Free browser voice typing: calls onText with each finished phrase. */
export function VoiceTypeButton({ onText, className, label = "Voice typing" }: { onText: (text: string) => void; className?: string; label?: string }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const cb = useRef(onText); cb.current = onText;
  useEffect(() => () => { want.current = false; rec.current?.stop(); }, []);

  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) { toast.error("Voice typing isn't supported in this browser. Try Chrome, Edge, or Safari."); return; }
    const r = new C();
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]!; if (res.isFinal) { const t = res[0].transcript.trim(); if (t) cb.current(t); } } };
    r.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { want.current = false; toast.error("Allow microphone access to use voice typing."); } };
    r.onend = () => { if (want.current) { try { r.start(); } catch { setOn(false); } } else setOn(false); };
    rec.current = r; want.current = true;
    try { r.start(); setOn(true); toast.success("Listening… speak now"); } catch { setOn(false); }
  };
  const stop = () => { want.current = false; rec.current?.stop(); setOn(false); };

  return (
    <Button type="button" size="sm" variant={on ? "default" : "ghost"} aria-label={on ? "Stop voice typing" : label} aria-pressed={on} title={on ? "Stop voice typing" : label}
      onMouseDown={e => e.preventDefault()} onClick={on ? stop : start} className={cn(on && "animate-pulse", className)}>
      {on ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}
