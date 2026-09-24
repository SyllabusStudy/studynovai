import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/quizzes/")({
  head: () => ({
    meta: [
      { title: "Quizzes — StudyMate AI" },
      { name: "description", content: "Generate exam-level practice quizzes from your own course materials." },
      { property: "og:title", content: "Quizzes — StudyMate AI" },
      { property: "og:description", content: "Practice quizzes generated from your own materials." },
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
  const [classId, setClassId] = useState("");
  const { data: documents = [] } = useDocuments(user?.id, classId || undefined);
  const { data: quizzes = [], isLoading } = useQuizzes(user?.id);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [types, setTypes] = useState<string[]>(["multiple_choice", "true_false"]);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(generateQuiz);

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
      toast.error(e instanceof Error ? e.message : "Generation failed");
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
      <PageHeader title="Quizzes" description="Practice with questions written from your own material." />

      <Hint id="quizzes-source" point="down" className="mb-4">
        Select a class and the exact chapters or notes you want quizzed on — StudyMate writes questions only from your own uploads.
      </Hint>

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Class</Label>
          <Select
            value={classId}
            onValueChange={(v) => {
              setClassId(v);
              setDocumentIds([]);
            }}
          >
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
          <Label>Source material</Label>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {classId ? "No uploads for this class yet." : "Pick a class to choose materials."}
            </p>
          ) : (
            <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-xl border border-border/60 p-2.5">
              <p className="text-xs text-muted-foreground">
                {documentIds.length === 0
                  ? "All materials"
                  : `${documentIds.length} selected`}
              </p>
              {documents.map((d) => (
                <label key={d.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={documentIds.includes(d.id)}
                    onCheckedChange={(v) =>
                      setDocumentIds((prev) =>
                        v === true ? [...prev, d.id] : prev.filter((p) => p !== d.id),
                      )
                    }
                  />
                  <span className="break-words leading-tight">{d.file_name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qcount">Questions</Label>
          <Input
            id="qcount"
            type="number"
            min={5}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
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
        <div className="flex flex-wrap gap-4 sm:col-span-2 lg:col-span-4">
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
        <div className="sm:col-span-2 lg:col-span-4">
          <Button onClick={generate} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate quiz
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : quizzes.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="No quizzes yet"
            description="Pick a class and generate your first practice quiz."
          />
        ) : (
          <ul className="space-y-2">
            {quizzes.map((q) => (
              <li key={q.id} className="surface-card flex items-center gap-3 p-4">
                <FileQuestion className="size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{q.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.difficulty} · {formatDate(q.created_at.slice(0, 10))}
                    {q.score !== null ? ` · scored ${q.score}%` : ""}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/quizzes/$quizId" params={{ quizId: q.id }}>
                    {q.completed_at ? "Review" : "Start"}
                  </Link>
                </Button>
                <DeleteButton
                  label="quiz"
                  description={`"${q.title}" and your answers for it will be removed.`}
                  onDelete={() => deleteQuiz(q.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
