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
    <div className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center sm:px-6 sm:py-14">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-balance text-base font-semibold">{title}</h3>
      <p className="mt-1 w-full max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
