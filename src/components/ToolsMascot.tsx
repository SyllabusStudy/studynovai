import { useEffect, useState } from "react";
import { X } from "lucide-react";

const TOOL_PATHS = ["/flashcards", "/quizzes", "/tutor", "/quickvideo", "/lectures", "/studio", "/ai-checker", "/snapquick"];
const KEY = "studynova:tools-explored";

/** Little animated buddy above "More" on phones, nudging people who haven't tried other tools. */
export function ToolsMascot({ pathname, onOpen }: { pathname: string; onOpen: () => void }) {
  const [show, setShow] = useState(false);
  const [explored, setExplored] = useState(true);

  useEffect(() => {
    const seen = localStorage.getItem(KEY) === "1";
    if (!seen && TOOL_PATHS.some((p) => pathname.startsWith(p))) {
      localStorage.setItem(KEY, "1");
      setExplored(true);
    } else setExplored(seen);
  }, [pathname]);

  useEffect(() => {
    if (explored) { setShow(false); return; }
    let hide: number | undefined;
    const pop = () => {
      setShow(true);
      hide = window.setTimeout(() => setShow(false), 7000);
    };
    const first = window.setTimeout(pop, 12000);
    const every = window.setInterval(pop, 75000);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hide); };
  }, [explored]);

  if (!show) return null;

  const done = () => { localStorage.setItem(KEY, "1"); setExplored(true); };

  return (
    <div className="pointer-events-none absolute bottom-full right-2 mb-1 flex items-end gap-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="pointer-events-auto relative mb-8 rounded-2xl rounded-br-sm border border-primary/40 bg-card px-3 py-2 text-xs font-bold shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
        <button type="button" onClick={() => { done(); onOpen(); }}>Check out more tools! ✨</button>
        <button type="button" aria-label="Dismiss" onClick={() => setShow(false)} className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <X className="size-3" />
        </button>
      </div>
      <button
        type="button"
        aria-label="Open more tools"
        onClick={() => { done(); onOpen(); }}
        className="pointer-events-auto relative flex size-12 animate-bounce items-center justify-center rounded-full bg-primary shadow-[0_0_24px_var(--primary)]"
      >
        <MascotFace />
      </button>
    </div>
  );
}

/** The buddy's face/antenna/arm — reused by the onboarding tour. */
export function MascotFace() {
  return (
    <>
        <span className="absolute -top-2 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-primary" />
        <span className="absolute -top-3 left-1/2 size-2 -translate-x-1/2 animate-pulse rounded-full bg-accent" />
        <span className="flex gap-2">
          <span className="size-2 animate-[mascot-blink_3s_infinite] rounded-full bg-primary-foreground" />
          <span className="size-2 animate-[mascot-blink_3s_infinite] rounded-full bg-primary-foreground" />
        </span>
        <span className="absolute bottom-3 h-1 w-3 rounded-b-full bg-primary-foreground" />
        <span className="absolute -right-1 top-5 h-1 w-3 origin-left animate-[mascot-wave_1s_ease-in-out_infinite] rounded-full bg-primary" />
    </>
  );
}

export function MascotBot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex size-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_var(--primary)] ${className}`}>
      <MascotFace />
    </span>
  );
}
