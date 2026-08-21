import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tiny, non-blocking coach mark. Sits inline in the layout, points at the
 * element above or below it, and disappears for good once dismissed.
 */
export function Hint({
  id,
  children,
  point = "down",
  className,
}: {
  id: string;
  children: React.ReactNode;
  point?: "up" | "down" | "none";
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const storageKey = `studymate-hint-${id}`;

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== "done") setShow(true);
    } catch {
      setShow(true);
    }
  }, [storageKey]);

  if (!show) return null;

  const Arrow = point === "up" ? ArrowUp : ArrowDown;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "done");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80",
        className,
      )}
    >
      {point === "none" ? null : (
        <Arrow className="mt-0.5 size-3.5 shrink-0 animate-bounce text-primary" />
      )}
      <p className="min-w-0 flex-1 leading-relaxed">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="-mr-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
