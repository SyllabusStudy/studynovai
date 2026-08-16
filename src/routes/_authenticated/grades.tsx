import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChartColumn, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ClassDot } from "@/components/ClassBadge";
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
import { useAuth } from "@/lib/auth";
import { classLabel, useAssignments, useClasses, useGradeCategories } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/grades")({
  head: () => ({
    meta: [
      { title: "Grades — StudyMate AI" },
      { name: "description", content: "Weighted grade categories, your current grade and what you need on the final." },
      { property: "og:title", content: "Grades — StudyMate AI" },
      { property: "og:description", content: "Current grade, weights and final-exam projections." },
    ],
  }),
  component: GradesPage,
});

function GradesPage() {
  const { user } = useAuth();
  const { data: classes = [], isLoading } = useClasses(user?.id);
  const { data: categories = [] } = useGradeCategories(user?.id);
  const { data: assignments = [] } = useAssignments(user?.id);

  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;

  return (
    <div>
      <PageHeader
        title="Grades"
        description="Add your syllabus weights, log scores, and see where you stand."
        actions={<NewCategoryDialog />}
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No classes yet"
          description="Add a class first, then set up its weighted grade categories."
        />
      ) : (
        <div className="space-y-4">
          {classes.map((c) => {
            const cats = categories.filter((g) => g.class_id === c.id);
            const graded = assignments.filter(
              (a) => a.class_id === c.id && a.points_earned !== null && a.points_possible,
            );

            let weighted = 0;
            let weightUsed = 0;
            for (const cat of cats) {
              const inCat = graded.filter((a) => (a.category ?? "") === cat.name);
              if (inCat.length === 0) continue;
              const earned = inCat.reduce((s, a) => s + (a.points_earned ?? 0), 0);
              const possible = inCat.reduce((s, a) => s + (a.points_possible ?? 0), 0);
              if (possible <= 0) continue;
              weighted += (earned / possible) * cat.weight;
              weightUsed += cat.weight;
            }
            const current = weightUsed > 0 ? (weighted / weightUsed) * 100 : null;

            return (
              <section key={c.id} className="surface-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
                    <ClassDot color={c.color} /> {classLabel(c)}
                  </h2>
                  <span className="text-lg font-bold">
                    {current === null ? "—" : `${current.toFixed(1)}%`}
                  </span>
                </div>
                {cats.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No weighted categories yet for this class.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {cats.map((cat) => (
                      <li key={cat.id} className="flex items-center justify-between">
                        <span>{cat.name}</span>
                        <span className="text-muted-foreground">{cat.weight}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                {c.target_grade && current !== null ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Target grade: {c.target_grade}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewCategoryDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ class_id: "", name: "", weight: 20 });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.class_id) {
      toast.error("Pick a class");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("grade_categories").insert({
      user_id: user.id,
      class_id: form.class_id,
      name: form.name,
      weight: form.weight,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["grade_categories"] });
    toast.success("Category added");
    setOpen(false);
    setForm({ class_id: "", name: "", weight: 20 });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> Add category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a grade category</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Category name</Label>
            <Input
              id="cat-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Exams"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-weight">Weight (%)</Label>
            <Input
              id="cat-weight"
              type="number"
              min={1}
              max={100}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
            />
          </div>
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
