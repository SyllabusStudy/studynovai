import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Folds optional settings away so each page shows only the essentials. */
export function MoreOptions({
  label = "More options",
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  label?: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-border/70 bg-secondary/30", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <SlidersHorizontal className="size-4 shrink-0 text-primary" />
        <span className="shrink-0">{label}</span>
        {summary && !open ? (
          <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">{summary}</span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border/70 p-4">{children}</div> : null}
    </div>
  );
}
