import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/25 bg-secondary/40 px-4 py-10 text-center sm:px-6 sm:py-14">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="size-7" />
      </div>
      <h3 className="mt-4 text-balance text-base font-semibold sm:text-lg">{title}</h3>
      <p className="mt-1.5 w-full max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
