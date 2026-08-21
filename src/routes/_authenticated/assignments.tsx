import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { EmptyState } from "@/components/EmptyState";
import { ClassChip } from "@/components/ClassBadge";
import { DeleteButton } from "@/components/DeleteButton";
import { AssignmentHelp } from "@/components/AssignmentHelp";
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
import { classLabel, daysUntil, relativeDay, urgencyDot, useAssignments, useClasses } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — StudyMate AI" },
      { name: "description", content: "Track every assignment, its due date, priority and status." },
      { property: "og:title", content: "Assignments — StudyMate AI" },
      { property: "og:description", content: "Track every assignment, due date and status." },
    ],
  }),
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: assignments = [], isLoading } = useAssignments(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const classById = new Map(classes.map((c) => [c.id, c]));

  async function toggle(id: string, done: boolean) {
    const { error } = await supabase
      .from("assignments")
      .update({ status: done ? "completed" : "not_started" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["assignments"] });
  }

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Everything you owe, sorted by what's due next. Attach a PDF or screenshot and AI helps you solve it."
        actions={<NewAssignmentDialog />}
      />

      <Hint id="assignments-ai-help" point="down" className="mb-4">
        Tap <strong>AI help</strong> on any assignment to attach a PDF or screenshot — StudyMate
        reads it and walks you through the questions.
      </Hint>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No assignments yet"
          description="Add one manually, or upload a syllabus and let StudyMate extract them."
          action={<NewAssignmentDialog />}
        />
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const done = a.status === "completed";
            return (
              <li key={a.id} className="surface-card flex items-center gap-3 p-4">
                <Checkbox checked={done} onCheckedChange={(v) => void toggle(a.id, v === true)} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-semibold", done && "line-through opacity-60")}>
                    {a.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className={urgencyDot(daysUntil(a.due_date))}>●</span> {relativeDay(a.due_date)} ·{" "}
                    {a.priority} priority
                  </p>
                </div>
                {a.class_id ? (
                  <ClassChip
                    color={classById.get(a.class_id)?.color}
                    label={classLabel(classById.get(a.class_id))}
                  />
                ) : null}
                <AssignmentHelp
                  assignmentId={a.id}
                  classId={a.class_id}
                  title={a.title}
                  category={a.category}
                />
                <DeleteButton
                  label="assignment"
                  description={`"${a.title}" will be removed from your list.`}
                  onDelete={async () => {
                    const { error } = await supabase.from("assignments").delete().eq("id", a.id);
                    if (error) throw new Error(error.message);
                    await supabase
                      .from("calendar_events")
                      .delete()
                      .eq("title", `Due: ${a.title}`)
                      .eq("event_type", "assignment");
                    await qc.invalidateQueries({ queryKey: ["assignments"] });
                    await qc.invalidateQueries({ queryKey: ["events"] });
                    await qc.invalidateQueries({ queryKey: ["calendar_events"] });
                  }}

                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewAssignmentDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", due_date: "", class_id: "", priority: "medium" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("assignments").insert({
      user_id: user.id,
      title: form.title,
      due_date: form.due_date || null,
      class_id: form.class_id || null,
      priority: form.priority,
    });
    if (!error && form.due_date) {
      await supabase.from("calendar_events").insert({
        user_id: user.id,
        class_id: form.class_id || null,
        title: `Due: ${form.title}`,
        event_type: "assignment",
        event_date: form.due_date,
        description: "Auto-added from your assignments list",
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
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> Add assignment
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
