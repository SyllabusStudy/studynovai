import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { listCalendarFeeds, removeCalendarFeed, syncCalendarFeed } from "@/lib/calendar-feed.functions";
import { classLabel, formatDate, useClasses } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function CalendarSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const list = useServerFn(listCalendarFeeds);
  const sync = useServerFn(syncCalendarFeed);
  const remove = useServerFn(removeCalendarFeed);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [classId, setClassId] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const feeds = useQuery({ queryKey: ["calendar-feeds", user?.id], enabled: open && !!user, queryFn: () => list() });

  async function fromFile(f: File) {
    if (f.size > 5_000_000) return void toast.error("That file is too big.");
    await run({ icsText: await f.text(), classId: classId === "auto" ? null : classId }, "file");
  }

  async function run(payload: { id?: string; url?: string; icsText?: string; classId?: string | null }, key: string) {
    setBusy(key);
    try {
      const r = await sync({ data: { ...payload, tz: tz() } });
      toast.success(`Synced ${r.total} items — ${r.added} new, ${r.updated} updated`);
      setUrl("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["calendar-feeds"] }),
        qc.invalidateQueries({ queryKey: ["events"] }),
        qc.invalidateQueries(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Link2 className="size-4" /> Sync Canvas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Canvas or Blackboard</DialogTitle>
          <DialogDescription>
            Paste your school calendar link once. Due dates and exams fill your calendar and class tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Canvas in 3 taps</p>
          <ol className="grid grid-cols-3 gap-2">
            {[
              { n: 1, t: "Open Calendar", d: "Left menu in Canvas" },
              { n: 2, t: "Tap Calendar Feed", d: "Bottom of the right side (scroll down on phone)" },
              { n: 3, t: "Copy & paste", d: "Copy the link, paste it below" },
            ].map((s) => (
              <li key={s.n} className="rounded-lg border border-border bg-secondary/50 p-2">
                <span className="mb-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{s.n}</span>
                <p className="text-xs font-semibold">{s.t}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            On the Canvas phone app? Open Canvas in your browser instead — the feed button only shows there.
            <br />
            <strong>Blackboard:</strong> Calendar → ⚙ or <em>Share calendar</em> → copy the iCal link.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ics-url">Calendar link</Label>
            <Input id="ics-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://school.instructure.com/feeds/calendars/user_….ics" />
          </div>
          <div className="space-y-1.5">
            <Label>Which class?</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Match each item to my classes automatically</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Items are matched by course name or code; anything unmatched goes to the class you pick here.</p>
          </div>
          <Button className="w-full" disabled={!url.trim() || busy !== null} onClick={() => void run({ url, classId: classId === "auto" ? null : classId }, "new")}>
            {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : null} Connect & sync
          </Button>
          <label
            className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground hover:bg-secondary/60"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void fromFile(f); }}
          >
            {busy === "file" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span>Link not working? Drop or pick your downloaded <strong>.ics</strong> calendar file</span>
            <input type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromFile(f); e.target.value = ""; }} />
          </label>
        </div>

        {feeds.data?.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-semibold">Connected calendars</p>
            {feeds.data.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg bg-secondary/60 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.label} · {f.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.last_synced_at ? `Last synced ${formatDate(f.last_synced_at.slice(0, 10))} · ${f.last_count ?? 0} items` : "Not synced yet"}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Sync now" disabled={busy !== null} onClick={() => void run({ id: f.id }, f.id)}>
                  {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </Button>
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={async () => { await remove({ data: { id: f.id } }); void feeds.refetch(); }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
