import { cn } from "@/lib/utils";
import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useClassPicker } from "@/lib/active-class";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileQuestion, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DeleteButton } from "@/components/DeleteButton";
import { Hint } from "@/components/Hint";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateQuiz } from "@/lib/ai.functions";
import { DIFFICULTIES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { classLabel, formatDate, useClasses, useDocuments, useQuizzes } from "@/lib/data";
import { AiKeySetupBanner, useAiKeyRedirect } from "@/lib/ai-key-gate";

export const Route = createFileRoute("/_authenticated/quizzes/")({
  head: () => ({
    meta: [
      { title: "Quizzes — SyllabusStudy" },
      { name: "description", content: "Generate exam-level practice quizzes from your own course materials." },
      { property: "og:title", content: "Quizzes — SyllabusStudy" },
      { property: "og:description", content: "Practice quizzes generated from your own materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizzesPage,
});

const TYPES = [
  { key: "multiple_choice", label: "Multiple choice" },
  { key: "true_false", label: "True / false" },
  { key: "short_answer", label: "Short answer" },
  { key: "problem", label: "Problems" },
];

const DIFFICULTY_HINTS: Record<string, string> = {
  easy: "Recall and core understanding",
  medium: "Apply and connect ideas",
  hard: "Analyze scenarios and mistakes",
  exam: "Synthesize, evaluate, and solve",
};

function QuizzesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [classId, setClassId] = useClassPicker("");
  const { data: documents = [] } = useDocuments(user?.id, classId || undefined);
  const { data: quizzes = [], isLoading } = useQuizzes(user?.id);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [types, setTypes] = useState<string[]>(["multiple_choice", "true_false"]);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(generateQuiz);
  const redirectForKey = useAiKeyRedirect();

  async function generate() {
    if (!classId) {
      toast.error("Pick a class first");
      return;
    }
    if (types.length === 0) {
      toast.error("Pick at least one question type");
      return;
    }
    setBusy(true);
    try {
      await run({
        data: { classId, documentIds, documentId: null, count, difficulty, types },
      });

      await qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Quiz ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (!redirectForKey(msg)) toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuiz(id: string) {
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["quizzes"] });
  }

  return (
    <div>
      <PageHeader title="Quizzes" description="Test yourself with questions from your own notes." />
      <ClassActionBar hide={["quiz"]} />
      <AiKeySetupBanner />

      <Hint id="quizzes-source" point="down" className="mb-4 hidden sm:flex">
        Pick a class and hit Make quiz. Choose chapters and question types under More options.
      </Hint>

      <section className="surface-card space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <FileQuestion className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">New quiz</h2>
            <p className="text-xs text-muted-foreground">Questions come only from your uploads</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setDocumentIds([]);
              }}
            >
              <SelectTrigger className="h-11">
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
          <Button onClick={generate} disabled={busy} size="lg" className="h-11 w-full gap-1.5 sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Writing your quiz…" : "Make quiz"}
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">Questions</p>
          <div className="flex flex-wrap gap-2">
            {[5, 10, 20, 30, 50].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                aria-pressed={count === n}
                className={cn(
                  "min-w-12 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  count === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <MoreOptions
          summary={`${difficulty} · ${documentIds.length ? `${documentIds.length} files` : "all materials"} · ${types.length} types`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Source material</Label>
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {classId ? "No uploads for this class yet." : "Pick a class to choose materials."}
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border/60 p-2.5">
                  <p className="text-xs text-muted-foreground">
                    {documentIds.length === 0 ? "All materials" : `${documentIds.length} selected`}
                  </p>
                  {documents.map((d) => (
                    <label key={d.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={documentIds.includes(d.id)}
                        onCheckedChange={(v) =>
                          setDocumentIds((prev) => (v === true ? [...prev, d.id] : prev.filter((p) => p !== d.id)))
                        }
                      />
                      <span className="break-words leading-tight">{d.file_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">{DIFFICULTY_HINTS[difficulty]}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qcount">Exact number (5–50)</Label>
                <Input id="qcount" type="number" min={5} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </div>
              <div className="flex flex-wrap gap-4">
                {TYPES.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={types.includes(t.key)}
                      onCheckedChange={(v) =>
                        setTypes((prev) => (v === true ? [...prev, t.key] : prev.filter((p) => p !== t.key)))
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </MoreOptions>
      </section>

      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Your quizzes</h2>
        {quizzes.length ? <span className="text-xs text-muted-foreground">{quizzes.length} total</span> : null}
      </div>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : quizzes.length === 0 ? (
        <EmptyState icon={FileQuestion} title="No quizzes yet" description="Pick a class above and tap Make quiz." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q) => (
            <li key={q.id} className="surface-card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                    q.score !== null ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {q.score !== null ? `${q.score}%` : <FileQuestion className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{q.title}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {q.difficulty} · {formatDate(q.created_at.slice(0, 10))}
                  </p>
                </div>
                <DeleteButton
                  label="quiz"
                  description={`"${q.title}" and your answers for it will be removed.`}
                  onDelete={() => deleteQuiz(q.id)}
                />
              </div>
              <Button asChild size="sm" variant={q.completed_at ? "outline" : "default"} className="w-full">
                <Link to="/quizzes/$quizId" params={{ quizId: q.id }}>
                  {q.completed_at ? "Review answers" : "Start quiz"}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
