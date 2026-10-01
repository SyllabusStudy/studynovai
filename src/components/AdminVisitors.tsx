import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getSharedViews } from "@/lib/admin.functions";

export function AdminVisitors() {
  const load = useServerFn(getSharedViews);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-shared-views"], queryFn: () => load() });
  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  const rows = data ?? [];
  const total = (k?: string) => rows.filter((r) => !k || r.kind === k).reduce((s, r) => s + (r.views ?? 0), 0);
  const stats = [
    { label: "Total visits from shared links", value: total() },
    { label: "Shared flashcard visits", value: total("deck") },
    { label: "Shared quiz visits", value: total("quiz") },
    { label: "Links shared", value: rows.length },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface-card p-4">
            <p className="text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="surface-card divide-y divide-border">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No shared quizzes or flashcards yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.token} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                {r.kind === "deck" ? "Flashcards" : "Quiz"}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              <span className="w-16 shrink-0 text-right font-bold">{r.views} visits</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
