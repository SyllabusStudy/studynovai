import { classColorToken } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ClassDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: classColorToken(color) }}
    />
  );
}

export function ClassChip({
  color,
  label,
}: {
  color?: string | null;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: `color-mix(in oklab, ${classColorToken(color)} 14%, transparent)`,
        color: classColorToken(color),
      }}
    >
      <ClassDot color={color} />
      {label}
    </span>
  );
}
