import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useActiveClass } from "@/lib/active-class";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, FileText, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { EmptyState } from "@/components/EmptyState";
import { ClassChip } from "@/components/ClassBadge";
import { DeleteButton } from "@/components/DeleteButton";
import { AssignmentHelp } from "@/components/AssignmentHelp";
import { ReminderSelect } from "@/components/ReminderSelect";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PRIORITIES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { classLabel, daysUntil, formatDate, type AssignmentRow, type ClassRow, relativeDay, urgencyDot, useAssignments, useClasses, useProfile } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — SyllabusStudy" },
      { name: "description", content: "Track every assignment, its due date, priority and status." },
      { property: "og:title", content: "Assignments — SyllabusStudy" },
      { property: "og:description", content: "Track every assignment, due date and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssignmentsPage,
});

type Filter = "all" | "soon" | "overdue" | "completed";

function typeOf(a: AssignmentRow): string {
  const t = `${a.category ?? ""} ${a.title}`.toLowerCase();
  if (/exam|midterm|final|test/.test(t)) return "Exam";
  if (/quiz/.test(t)) return "Quiz";
  if (/read|chapter/.test(t)) return "Reading";
  if (/essay|paper|reflection|writ|journal|discussion/.test(t)) return "Writing";
  if (/project|presentation|flyer/.test(t)) return "Project";
  if (/video|watch/.test(t)) return "Video";
  if (/worksheet|homework|problem|lab/.test(t)) return "Worksheet";
  return a.category ? a.category.charAt(0).toUpperCase() + a.category.slice(1) : "";
}

function AssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: assignments = [], isLoading } = useAssignments(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const [filter, setFilter] = useState<Filter>("all");
  const [classF, setClassF] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [prioF, setPrioF] = useState("all");
  const [q, setQ] = useState("");

  async function toggle(id: string, done: boolean) {
    const { error } = await supabase
      .from("assignments")
      .update({ status: done ? "completed" : "not_started" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (done) void recordStudyActivity("assignment_done", qc);
    await qc.invalidateQueries({ queryKey: ["assignments"] });
  }

  async function remove(a: AssignmentRow) {
    const { error } = await supabase.from("assignments").delete().eq("id", a.id);
    if (error) throw new Error(error.message);
    // Linked events cascade automatically; this clears older entries created before events were linked.
    await supabase.from("calendar_events").delete().eq("title", `Due: ${a.title}`).eq("event_type", "assignment");
    await qc.invalidateQueries({ queryKey: ["assignments"] });
    await qc.invalidateQueries({ queryKey: ["events"] });
    await qc.invalidateQueries({ queryKey: ["calendar_events"] });
  }

  const types = Array.from(new Set(assignments.map(typeOf).filter(Boolean))).sort();
  const shown = assignments.filter((a) => {
    const d = daysUntil(a.due_date);
    const done = a.status === "completed";
    if (filter === "completed" ? !done : done) return false;
    if (filter === "soon" && !(d !== null && d >= 0 && d <= 3)) return false;
    if (filter === "overdue" && !(d !== null && d < 0)) return false;
    if (classF !== "all" && a.class_id !== classF) return false;
    if (typeF !== "all" && typeOf(a) !== typeF) return false;
    if (prioF !== "all" && a.priority !== prioF) return false;
    if (q.trim() && !`${a.title} ${a.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const groups: { key: string; title: string; items: AssignmentRow[] }[] =
    filter === "completed"
      ? [{ key: "done", title: "Completed", items: shown }]
      : [
          { key: "overdue", title: "Overdue", items: shown.filter((a) => (daysUntil(a.due_date) ?? 1) < 0) },
          { key: "today", title: "Today", items: shown.filter((a) => daysUntil(a.due_date) === 0) },
          { key: "week", title: "This week", items: shown.filter((a) => { const d = daysUntil(a.due_date); return d !== null && d >= 1 && d <= 7; }) },
          { key: "later", title: "Later", items: shown.filter((a) => { const d = daysUntil(a.due_date); return d === null || d > 7; }) },
        ];

  const tabs: [Filter, string][] = [["all", "All"], ["soon", "Due soon"], ["overdue", "Overdue"], ["completed", "Completed"]];

  return (
    <div>
      <PageHeader
        title={<span className="dash-gradient-text">Assignments</span>}
        description="Stay on top of your work. Add, manage, and get AI help with your assignments."
        actions={<NewAssignmentDialog />}
      />
      <ClassActionBar />

      <Hint id="assignments-ai-help" point="down" className="mb-4">
        Tap <strong>Ask AI</strong> on any assignment to attach a PDF or screenshot — SyllabusStudy
        reads it and walks you through the questions.
      </Hint>

      <div className="dash-glass mb-6 space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
                filter === k ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-background/40 hover:border-primary/60",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <Select value={classF} onValueChange={setClassF}>
            <SelectTrigger className="h-10 bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeF} onValueChange={setTypeF}>
            <SelectTrigger className="h-10 bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prioF} onValueChange={setPrioF}>
            <SelectTrigger className="h-10 bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assignments..." className="h-10 bg-background/40 pl-9" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No assignments yet"
          description="Add one manually, or upload a syllabus and let SyllabusStudy extract them."
          action={<NewAssignmentDialog />}
        />
      ) : shown.length === 0 ? (
        <div className="dash-glass p-6 text-center text-sm text-muted-foreground">
          {filter === "all" && !q && classF === "all" && typeF === "all" && prioF === "all"
            ? "You're caught up. Finished assignments are under Completed."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="space-y-7">
          {groups.filter((g) => g.items.length).map((g) => (
            <section key={g.key} aria-labelledby={`grp-${g.key}`}>
              <div className="mb-2.5 flex items-baseline gap-2">
                <h2 id={`grp-${g.key}`} className={cn("font-display text-sm font-extrabold uppercase tracking-wider", g.key === "overdue" ? "text-destructive" : g.key === "today" ? "text-primary" : "text-muted-foreground")}>
                  {g.title}
                </h2>
                <span className="text-xs text-muted-foreground">{g.items.length} task{g.items.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="space-y-2">
                {g.items.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    a={a}
                    cls={a.class_id ? classById.get(a.class_id) : undefined}
                    onToggle={(v) => void toggle(a.id, v)}
                    onDelete={() => remove(a)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  a,
  cls,
  onToggle,
  onDelete,
}: {
  a: AssignmentRow;
  cls: ClassRow | undefined;
  onToggle: (done: boolean) => void;
  onDelete: () => Promise<void>;
}) {
  const done = a.status === "completed";
  const d = daysUntil(a.due_date);
  const overdue = !done && d !== null && d < 0;
  const today = !done && d === 0;
  const soon = !done && d !== null && d > 0 && d <= 3;
  const type = typeOf(a);
  return (
    <li
      className={cn(
        "dash-glass flex flex-col gap-3 p-3.5 transition-all hover:border-primary/40 sm:flex-row sm:items-center sm:p-4",
        today && "border-primary/60 shadow-[0_0_24px_-8px_var(--primary)]",
        overdue && "border-destructive/60",
        soon && "border-warning/50",
        done && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Checkbox className="mt-1" checked={done} onCheckedChange={(v) => onToggle(v === true)} aria-label={`Mark ${a.title} done`} />
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary sm:flex">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold sm:text-base", done && "line-through")}>{a.title}</p>
          {a.description ? <p className="line-clamp-1 text-xs text-muted-foreground">{a.description}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {cls ? <ClassChip color={cls.color} label={classLabel(cls)} /> : null}
            {type ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{type}</span> : null}
            <span className="text-xs text-muted-foreground">{a.priority} priority</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-7 sm:pl-0">
        <span
          className={cn(
            "mr-auto rounded-lg px-2.5 py-1 text-xs font-bold sm:mr-0",
            overdue ? "bg-destructive/15 text-destructive" : today ? "bg-primary/15 text-primary" : soon ? "bg-warning/15 text-warning" : "bg-muted/40 text-muted-foreground",
          )}
        >
          <span className={urgencyDot(d)}>●</span> {a.due_date ? `${relativeDay(a.due_date)} · ${formatDate(a.due_date)}` : "No date"}
        </span>
        <AssignmentHelp assignmentId={a.id} classId={a.class_id} title={a.title} category={a.category} />
        <DeleteButton label="assignment" description={`"${a.title}" will be removed from your list.`} onDelete={onDelete} />
      </div>
    </li>
  );
}

function NewAssignmentDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", due_date: "", class_id: "", priority: "medium" });
  const { data: profile } = useProfile(user?.id);
  const savedDefault = profile?.default_reminder_minutes ?? 1440;
  const [reminder, setReminder] = useState<number | null>(null);
  const { activeClassId } = useActiveClass();
  useEffect(() => {
    if (open && !form.class_id && activeClassId) {
      setForm((f) => ({ ...f, class_id: activeClassId }));
    }
  }, [open, activeClassId]);
  useEffect(() => {
    setReminder((prev) => (prev === null ? savedDefault : prev));
  }, [savedDefault]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data: created, error } = await supabase
      .from("assignments")
      .insert({
        user_id: user.id,
        title: form.title,
        due_date: form.due_date || null,
        class_id: form.class_id || null,
        priority: form.priority,
        reminder_minutes: reminder,
      })
      .select("id")
      .maybeSingle();
    if (!error && form.due_date) {
      // Linked to the assignment so the calendar entry can open its AI help.
      await supabase.from("calendar_events").insert({
        user_id: user.id,
        class_id: form.class_id || null,
        assignment_id: created?.id ?? null,
        title: `Due: ${form.title}`,
        event_type: "assignment",
        event_date: form.due_date,
        description: "Auto-added from your assignments list",
        reminder_minutes: reminder,
      });
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["assignments"] });
    await qc.invalidateQueries({ queryKey: ["events"] });
    await qc.invalidateQueries({ queryKey: ["calendar_events"] });
    toast.success(form.due_date ? "Assignment added to your calendar" : "Assignment added");

    setOpen(false);
    setForm({ title: "", due_date: "", class_id: "", priority: "medium" });
    setReminder(savedDefault);
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-1.5 shadow-lg" data-tour="add-assignment">
          <Plus className="size-4" /> Add Assignment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an assignment</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ReminderSelect value={reminder} onChange={setReminder} />
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
