import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, categoryLabel } from "@/components/FeedbackForm";

export function AdminFeedback() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("id, user_email, category, topic, message, rating, page, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("feedback").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  const rows = data.map((f) => ({ ...f, cat: f.category && f.category !== "other" ? f.category : f.topic }));
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 864e5;
    const rated = rows.filter((r) => r.rating);
    const counts = new Map<string, number>();
    rows.filter((r) => r.cat !== "feature").forEach((r) => counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1));
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const latestFeature = rows.find((r) => r.cat === "feature");
    return [
      { label: "Total feedback", value: rows.length },
      { label: "New", value: rows.filter((r) => r.status === "new").length },
      { label: "In review", value: rows.filter((r) => r.status === "in_review").length },
      { label: "Resolved", value: rows.filter((r) => r.status === "resolved").length },
      { label: "This week", value: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length },
      { label: "Open issues", value: rows.filter((r) => r.status !== "resolved" && r.cat !== "feature").length },
      { label: "Average rating", value: rated.length ? (rated.reduce((n, r) => n + (r.rating ?? 0), 0) / rated.length).toFixed(1) : "—" },
      { label: "Most common issue", value: common ? categoryLabel(common[0]) : "—" },
      { label: "Latest feature request", value: latestFeature ? latestFeature.message.slice(0, 40) : "—" },
    ];
  }, [rows]);

  const filtered = rows.filter(
    (r) =>
      (cat === "all" || r.cat === cat) &&
      (status === "all" || r.status === status) &&
      (!q || `${r.message} ${r.user_email ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="truncate text-lg font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search feedback or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {FEEDBACK_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FEEDBACK_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No feedback found" description="New submissions show up here." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((f) => (
            <li key={f.id} className="surface-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-primary">{categoryLabel(f.cat)}</span>
                <span className="text-muted-foreground">{f.user_email ?? "Unknown"}</span>
                <span className="text-muted-foreground">· {new Date(f.created_at).toLocaleString()}</span>
                {f.page ? <span className="text-muted-foreground">· {f.page}</span> : null}
                {f.rating ? (
                  <span className="inline-flex items-center gap-0.5 text-warning"><Star className="size-3 fill-warning" />{f.rating}</span>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
              <div className="mt-3 flex items-center gap-2">
                <Select value={f.status} onValueChange={(v) => update.mutate({ id: f.id, status: v })}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id)} aria-label="Delete">
                  <Trash2 className="size-4" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
