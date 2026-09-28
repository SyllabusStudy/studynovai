import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { QuizRow } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId")({
  head: () => ({
    meta: [
      { title: "Take a quiz — StudyNova" },
      { name: "description", content: "Answer your AI-generated practice quiz and see explanations for every question." },
      { property: "og:title", content: "Take a quiz — StudyNova" },
      { property: "og:description", content: "Answer your practice quiz and review the explanations." },
    ],
  }),
  component: QuizRunner,
});

type Question = {
  id: string;
  type: string;
  prompt: string;
  options?: string[];
  answer: string;
  explanation?: string;
  topic?: string;
};

function QuizRunner() {
  const { quizId } = Route.useParams();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as QuizRow | null;
    },
  });

  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;
  if (!quiz) return <p className="text-sm text-muted-foreground">This quiz no longer exists.</p>;

  const questions = (quiz.questions as unknown as Question[]) ?? [];

  function isCorrect(q: Question) {
    const given = (answers[q.id] ?? "").trim().toLowerCase();
    return given.length > 0 && given === q.answer.trim().toLowerCase();
  }

  const correctCount = questions.filter(isCorrect).length;

  async function submit() {
    setBusy(true);
    const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
    const weak = questions.filter((q) => !isCorrect(q)).map((q) => q.topic ?? q.prompt.slice(0, 60));
    const { error } = await supabase
      .from("quizzes")
      .update({
        answers: answers as never,
        score,
        weak_topics: weak as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", quizId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
    await qc.invalidateQueries({ queryKey: ["quizzes"] });
    await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={quiz.title}
        description={
          submitted
            ? `You scored ${Math.round((correctCount / Math.max(questions.length, 1)) * 100)}% (${correctCount}/${questions.length})`
            : `${questions.length} questions · ${quiz.difficulty}`
        }
      />

      <ol className="space-y-4">
        {questions.map((q, i) => {
          const ok = isCorrect(q);
          return (
            <li key={q.id} className="surface-card p-5">
              <p className="text-sm font-semibold">
                {i + 1}. {q.prompt}
              </p>

              {q.options && q.options.length > 0 ? (
                <RadioGroup
                  className="mt-3 space-y-2"
                  value={answers[q.id] ?? ""}
                  onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  disabled={submitted}
                >
                  {q.options.map((opt) => (
                    <div key={opt} className="flex items-center gap-2">
                      <RadioGroupItem id={`${q.id}-${opt}`} value={opt} />
                      <Label htmlFor={`${q.id}-${opt}`} className="text-sm font-normal">
                        {opt}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <Textarea
                  className="mt-3"
                  rows={3}
                  disabled={submitted}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Your answer"
                />
              )}

              {submitted ? (
                <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm">
                  <p className={cn("flex items-center gap-1.5 font-semibold", ok ? "text-success" : "text-destructive")}>
                    {ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    {ok ? "Correct" : `Answer: ${q.answer}`}
                  </p>
                  {q.explanation ? <p className="mt-1 text-muted-foreground">{q.explanation}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!submitted ? (
        <Button className="mt-6" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Submit quiz
        </Button>
      ) : null}
    </div>
  );
}
