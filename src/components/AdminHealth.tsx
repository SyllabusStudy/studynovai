import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bug, CheckCircle2, Loader2, Timer, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AdminHealth() {
  const qc = useQueryClient();
  const [show, setShow] = useState<"open" | "all">("open");
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_health_events").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });
  const resolve = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase.from("app_health_events").update({ resolved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-health"] }),
    onError: () => toast.error("Could not update"),
  });
  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_health_events").delete().eq("resolved", true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cleared resolved items"); qc.invalidateQueries({ queryKey: ["admin-health"] }); },
  });

  const day = Date.now() - 86_400_000;
  const recent = data.filter((e) => !e.resolved && new Date(e.created_at).getTime() > day);
  const bugs = recent.filter((e) => e.kind === "bug").length;
  const lags = recent.filter((e) => e.kind === "lag").length;
  const status = bugs >= 5 ? { label: "Errors happening", cls: "text-destructive" } : bugs + lags > 0 ? { label: "Some slowdowns or errors", cls: "text-warning" } : { label: "All healthy", cls: "text-success" };
  const list = useMemo(() => (show === "open" ? data.filter((e) => !e.resolved) : data), [data, show]);

  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4"><Activity className="size-4 text-primary" /><p className={`mt-2 text-lg font-bold ${status.cls}`}>{status.label}</p><p className="text-xs text-muted-foreground">last 24 hours</p></div>
        <div className="surface-card p-4"><Bug className="size-4 text-destructive" /><p className="mt-2 text-2xl font-bold">{bugs}</p><p className="text-xs text-muted-foreground">bugs (24h, open)</p></div>
        <div className="surface-card p-4"><Timer className="size-4 text-warning" /><p className="mt-2 text-2xl font-bold">{lags}</p><p className="text-xs text-muted-foreground">lags (24h, open)</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={show === "open" ? "default" : "outline"} onClick={() => setShow("open")}>Open</Button>
        <Button size="sm" variant={show === "all" ? "default" : "outline"} onClick={() => setShow("all")}>All</Button>
        <Button size="sm" variant="ghost" onClick={() => clear.mutate()}><Trash2 className="size-4" /> Clear resolved</Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No problems reported. Bugs and lags from every account show up here automatically.</p>
      ) : list.map((e) => (
        <div key={e.id} className={`surface-card space-y-2 p-4 ${e.resolved ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {e.kind === "bug" ? <Bug className="size-4 text-destructive" /> : <Timer className="size-4 text-warning" />}
              {e.kind === "bug" ? "Bug" : `Lag · ${((e.duration_ms ?? 0) / 1000).toFixed(1)}s`}
              <span className="text-xs font-normal text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.page}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: e.id, resolved: !e.resolved })}>
              <CheckCircle2 className="size-4" /> {e.resolved ? "Reopen" : "Mark resolved"}
            </Button>
          </div>
          <p className="break-words text-xs text-muted-foreground">{e.message}</p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p><span className="font-semibold">What happened:</span> {e.diagnosis}</p>
            <p className="mt-1 flex gap-1"><Wrench className="mt-0.5 size-3.5 shrink-0 text-primary" /><span><span className="font-semibold">How to fix:</span> {e.fix}</span></p>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{e.device}</p>
        </div>
      ))}
    </div>
  );
}
