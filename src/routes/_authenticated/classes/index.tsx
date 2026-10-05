import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Plus, Upload } from "lucide-react";
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
import { MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ClassCoverBg, ChangeCoverMenu } from "@/components/ClassCover";
import { coverFor, useCoverOverrides } from "@/lib/class-covers";

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
  const overrides = useCoverOverrides();
  const qc = useQueryClient();
  const building = documents.filter(
    (d) =>
      d.is_syllabus &&
      ["processing", "pending", "analyzing"].includes(d.processing_status ?? "") &&
      Date.now() - new Date(d.created_at).getTime() < 10 * 60_000,
  );
  const buildingCount = building.length;
  useEffect(() => {
    if (buildingCount === 0) void qc.invalidateQueries({ queryKey: ["classes"] });
  }, [buildingCount, qc]);

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
      ) : classes.length === 0 && building.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No classes yet"
          description="Add your first class to start building your semester."
          action={<NewClassDialog />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {building.map((d) => (
            <div key={d.id} className="surface-card flex animate-pulse flex-col justify-center gap-2 border-primary/40 p-5" aria-live="polite">
              <span className="flex items-center gap-2 text-sm font-bold text-primary">
                <Loader2 className="size-4 animate-spin" /> Building class from syllabus...
              </span>
              <span className="text-sm text-muted-foreground">Reading course details, grade weights & policies</span>
              <span className="truncate text-xs text-muted-foreground">{d.file_name}</span>
            </div>
          ))}
          {classes.map((c) => {
            const list = assignments.filter((a) => a.class_id === c.id);
            const open = list.filter((a) => a.status !== "completed").length;
            const pct = list.length ? Math.round(((list.length - open) / list.length) * 100) : 0;
            return (
            <div key={c.id} className="group relative min-h-56 overflow-hidden rounded-2xl border border-border transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg">
              <ClassCoverBg src={coverFor(c, overrides)} />
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-md bg-background/50 p-1.5 backdrop-blur hover:bg-background/80" aria-label="Class options">
                    <MoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><Link to="/classes/$classId" params={{ classId: c.id }}>Open class</Link></DropdownMenuItem>
                    <ChangeCoverMenu classId={c.id} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="rounded-md bg-background/50 backdrop-blur"><DeleteClassButton classId={c.id} className_={c.class_name} /></div>
              </div>
              <Link to="/classes/$classId" params={{ classId: c.id }} className="relative flex h-full min-h-56 flex-col p-5">
                <div className="flex items-center gap-2 self-start rounded-md bg-background/60 px-2 py-1 backdrop-blur">
                  <ClassDot color={c.color} />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {c.course_code || "Course"}
                  </span>
                </div>
                <div className="mt-auto pt-6">
                  <h2 className="font-display text-lg font-bold leading-snug tracking-tight">{c.class_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{c.professor || "No instructor yet"}</p>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span><strong>{open}</strong> <span className="text-muted-foreground">open tasks</span></span>
                    <span><strong>{documents.filter((d) => d.class_id === c.id).length}</strong> <span className="text-muted-foreground">documents</span></span>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold">{pct}%</span>
                    </div>
                  )}
                  <span className="mt-3 inline-flex text-sm font-semibold text-primary">Open Class →</span>
                </div>
              </Link>
            </div>
            );
          })}
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

const QUICK_CLASSES = [
  { code: "BIO 101", name: "General Biology" },
  { code: "MATH 151", name: "Calculus I" },
  { code: "PSY 101", name: "Intro to Psychology" },
  { code: "ENG 101", name: "English Composition" },
  { code: "CHEM 101", name: "General Chemistry" },
  { code: "ECON 102", name: "Macroeconomics" },
];

function NewClassDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a class</DialogTitle>
        </DialogHeader>
        {showSyllabus ? (
          <div className="space-y-3">
            <DocumentUploader
              syllabusOnly
              hint="We'll create the class and fill in the name, professor and dates for you."
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowSyllabus(false)}>
              ← Type it in instead
            </Button>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4">
          <button
            type="button"
            onClick={() => setShowSyllabus(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
          >
            <Upload className="size-5 shrink-0 text-primary" />
            <span className="text-sm">
              <span className="font-semibold">Have your syllabus?</span>{" "}
              <span className="text-muted-foreground">Drop it in and we'll fill everything in for you.</span>
            </span>
          </button>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or tap a popular class</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_CLASSES.map((q, i) => (
                <button
                  key={q.code}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      class_name: q.name,
                      course_code: q.code,
                      color: CLASS_COLORS[i % CLASS_COLORS.length]!.key,
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary",
                    form.course_code === q.code && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  {q.code} · {q.name}
                </button>
              ))}
            </div>
          </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
