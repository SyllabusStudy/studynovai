import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { SyllabusCsvExport } from "@/components/SyllabusCsvExport";
import { EmptyState } from "@/components/EmptyState";
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
import { CLASS_COLORS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { useAssignments, useClasses, useDocuments } from "@/lib/data";
import { DocumentUploader } from "@/components/DocumentUploader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/classes/")({
  head: () => ({
    meta: [
      { title: "My Classes — SyllabusStudy" },
      { name: "description", content: "Every course you're taking, with materials, policies and deadlines." },
      { property: "og:title", content: "My Classes — SyllabusStudy" },
      { property: "og:description", content: "Every course you're taking, with materials and deadlines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassesPage,
});

function ClassesPage() {
  const { user } = useAuth();
  const { data: classes = [], isLoading } = useClasses(user?.id);
  const { data: documents = [] } = useDocuments(user?.id);
  const { data: assignments = [] } = useAssignments(user?.id);

  return (
    <div>
      <PageHeader
        title="My Classes"
        description="Add each course, then drop in the syllabus to auto-build your semester."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyllabusCsvExport />
            <NewClassDialog />
          </div>
        }
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold tracking-tight">Import a syllabus PDF</h2>
        <Hint id="classes-syllabus" point="down" className="mb-2">
          Start here: drop your syllabus PDF in the box below and SyllabusStudy builds the class,
          exams, homework and grade weights for you.
        </Hint>
        <DocumentUploader syllabusOnly />
      </section>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : classes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No classes yet"
          description="Add your first class to start building your semester."
          action={<NewClassDialog />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <div key={c.id} className="surface-card relative p-5 transition-colors hover:border-primary/40">
              <div className="absolute right-2 top-2">
                <DeleteClassButton classId={c.id} className_={c.class_name} />
              </div>
              <Link to="/classes/$classId" params={{ classId: c.id }} className="block">
                <div className="flex items-center gap-2">
                  <ClassDot color={c.color} />
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {c.course_code || "Course"}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-bold tracking-tight">{c.class_name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.professor || "No instructor yet"}</p>
                <div className="mt-4 flex gap-4 text-sm">
                  <span><strong>{assignments.filter((a) => a.class_id === c.id && a.status !== "completed").length}</strong> <span className="text-muted-foreground">open tasks</span></span>
                  <span><strong>{documents.filter((d) => d.class_id === c.id).length}</strong> <span className="text-muted-foreground">documents</span></span>
                </div>
                <span className="mt-4 inline-flex text-sm font-semibold text-primary">Open Class →</span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteClassButton({ classId, className_ }: { classId: string; className_: string }) {
  const qc = useQueryClient();
  return (
    <DeleteButton
      label="class"
      description={`"${className_}" and its documents, assignments, events, flashcards and quizzes will be deleted.`}
      onDelete={async () => {
        const children = [
          "calendar_events",
          "assignments",
          "flashcards",
          "quizzes",
          "grade_categories",
          "study_progress",
          "ai_conversations",
          "documents",
        ] as const;
        for (const table of children) {
          const { error } = await supabase.from(table).delete().eq("class_id", classId);
          if (error) throw new Error(error.message);
        }
        const { error } = await supabase.from("classes").delete().eq("id", classId);
        if (error) throw new Error(error.message);
        await qc.invalidateQueries();
      }}
    />
  );
}

function NewClassDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    class_name: "",
    course_code: "",
    professor: "",
    semester: "",
    color: CLASS_COLORS[0].key as string,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("classes").insert({
      user_id: user.id,
      class_name: form.class_name,
      course_code: form.course_code || null,
      professor: form.professor || null,
      semester: form.semester || null,
      color: form.color,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["classes"] });
    toast.success("Class added");
    setOpen(false);
    setForm({ class_name: "", course_code: "", professor: "", semester: "", color: CLASS_COLORS[0].key });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" data-tour="add-class">
          <Plus className="size-4" /> Add class
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a class</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="class_name">Class name</Label>
            <Input
              id="class_name"
              required
              value={form.class_name}
              onChange={(e) => setForm({ ...form, class_name: e.target.value })}
              placeholder="Introduction to Psychology"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course_code">Course code</Label>
              <Input
                id="course_code"
                value={form.course_code}
                onChange={(e) => setForm({ ...form, course_code: e.target.value })}
                placeholder="PSY 101"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semester">Semester</Label>
              <Input
                id="semester"
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                placeholder="Fall 2026"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="professor">Instructor</Label>
            <Input
              id="professor"
              value={form.professor}
              onChange={(e) => setForm({ ...form, professor: e.target.value })}
              placeholder="Dr. Rivera"
            />
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {CLASS_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.label}
                  onClick={() => setForm({ ...form, color: c.key })}
                  className={cn(
                    "size-7 rounded-full border-2",
                    form.color === c.key ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c.token }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save class
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
