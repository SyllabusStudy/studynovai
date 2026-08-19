import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { ClassDot } from "@/components/ClassBadge";
import { DeleteButton } from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { classLabel, formatDate, useClasses, useEvents } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — StudyMate AI" },
      { name: "description", content: "Every exam, quiz, project and deadline for your semester in one view." },
      { property: "og:title", content: "Calendar — StudyMate AI" },
      { property: "og:description", content: "Exams, quizzes and deadlines for your whole semester." },
    ],
  }),
  component: CalendarPage,
});

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useEvents(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {

    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    const list = byDate.get(e.event_date) ?? [];
    list.push(e);
    byDate.set(e.event_date, list);
  }

  const todayIso = iso(new Date());

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Colour-coded per class, built from your syllabi and anything you add."
        actions={<NewEventDialog />}
      />

      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-bold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading ? <Loader2 className="size-5 animate-spin text-primary" /> : null}

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="py-2">
            {d.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const key = iso(d);
          const dayEvents = byDate.get(key) ?? [];
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(key)}
              className={cn(
                "min-h-20 rounded-lg border border-border bg-card p-1.5 text-left transition-colors hover:border-primary hover:bg-accent/40",
                d.getMonth() !== cursor.getMonth() && "opacity-40",
                key === todayIso && "border-primary",
              )}
            >
              <span className="text-xs font-semibold">{d.getDate()}</span>
              <ul className="mt-1 space-y-1">
                {dayEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-1 text-[10px] leading-tight">
                    <ClassDot color={e.class_id ? classById.get(e.class_id)?.color : null} className="mt-0.5 size-1.5" />
                    <span className="line-clamp-2">
                      {e.event_time ? `${e.event_time} ` : ""}
                      {e.title}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? formatDate(selected) : "Day"}</DialogTitle>
          </DialogHeader>
          {selected && (byDate.get(selected) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled on this day.</p>
          ) : (
            <ul className="space-y-2">
              {(selected ? byDate.get(selected) ?? [] : []).map((e) => (
                <li key={e.id} className="surface-card flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.event_time ? e.event_time : "No time listed"} ·{" "}
                      {EVENT_TYPE_LABELS[e.event_type] ?? "Event"}
                      {e.class_id ? ` · ${classLabel(classById.get(e.class_id))}` : ""}
                    </p>
                    {e.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
                    ) : null}
                  </div>
                  <DeleteButton
                    label="event"
                    description={`"${e.title}" will be removed from your calendar.`}
                    onDelete={async () => {
                      const { error } = await supabase.from("calendar_events").delete().eq("id", e.id);
                      if (error) throw new Error(error.message);
                      await qc.invalidateQueries({ queryKey: ["events"] });
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>


      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        All events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <CalendarDays className="mr-1 inline size-4" /> Nothing scheduled yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="surface-card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {EVENT_TYPE_LABELS[e.event_type] ?? "Event"} · {formatDate(e.event_date)}
                </p>
              </div>
              {e.class_id ? (
                <span className="text-xs text-muted-foreground">{classLabel(classById.get(e.class_id))}</span>
              ) : null}
              <DeleteButton
                label="event"
                description={`"${e.title}" will be removed from your calendar.`}
                onDelete={async () => {
                  const { error } = await supabase.from("calendar_events").delete().eq("id", e.id);
                  if (error) throw new Error(error.message);
                  await qc.invalidateQueries({ queryKey: ["events"] });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewEventDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", event_date: "", event_time: "", event_type: "exam", class_id: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      title: form.title,
      event_date: form.event_date,
      event_time: form.event_time || null,
      event_type: form.event_type,
      class_id: form.class_id || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["events"] });
    toast.success("Event added");
    setOpen(false);
    setForm({ title: "", event_date: "", event_time: "", event_type: "exam", class_id: "" });
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> Add event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an event</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                required
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-time">Time</Label>
              <Input
                id="event-time"
                type="time"
                value={form.event_time}
                onChange={(e) => setForm({ ...form, event_time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">

              <Label>Type</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EVENT_TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {classes.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {classLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
