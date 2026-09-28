import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 pt-1 sm:mb-10 sm:border-b sm:border-border sm:pb-7 sm:pt-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-3 hidden items-center gap-2 sm:flex" aria-hidden="true">
            <span className="h-px w-8 bg-primary" />
            <span className="text-[10px] font-extrabold uppercase text-primary">Study workspace</span>
          </div>
          <h1 className="font-display text-2xl font-extrabold sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mt-2 sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
