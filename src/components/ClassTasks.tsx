import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, useAssignments, useEvents, useFlashcards, useQuizzes } from "@/lib/data";

type Kind = "test" | "quiz" | "flashcards" | "practice" | "assignment";
const FILTERS: Array<{ id: "all" | Kind; label: string }> = [
  { id: "all", label: "All" },
  { id: "test", label: "Tests" },
  { id: "quiz", label: "Quizzes" },
  { id: "flashcards", label: "Flashcards" },
  { id: "practice", label: "Practice" },
  { id: "assignment", label: "Assignments" },
];
const ICON: Record<Kind, string> = { test: "📝", quiz: "❓", flashcards: "🧠", practice: "📚", assignment: "📄" };
const LABEL: Record<Kind, string> = { test: "Test", quiz: "Quiz", flashcards: "Flashcards", practice: "Practice", assignment: "Assignment" };

type Task = {
  key: string;
  kind: Kind;
  title: string;
  meta: string;
  status: string;
  created: string;
  sortDate: string;
  action: string;
  link: { to: string; params?: Record<string, string> };
};

function kindFromText(text: string | null | undefined): Kind | null {
  const t = (text ?? "").toLowerCase();
  if (/(exam|test|midterm|final)/.test(t)) return "test";
  if (/practice/.test(t)) return "practice";
  if (/quiz/.test(t)) return "quiz";
  return null;
}

export function ClassTasks({ userId, classId }: { userId?: string; classId: string }) {
  const { data: assignments = [] } = useAssignments(userId, classId);
  const { data: events = [] } = useEvents(userId, classId);
  const { data: cards = [] } = useFlashcards(userId, classId);
  const { data: quizzes = [] } = useQuizzes(userId, classId);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const tasks = useMemo<Task[]>(() => {
    const out: Task[] = [];
    for (const q of quizzes) {
      const n = Array.isArray(q.questions) ? q.questions.length : 0;
      const done = !!q.completed_at;
      const score = q.score != null ? Math.round(Number(q.score) * (Number(q.score) <= 1 ? n : n / 100)) : null;
      out.push({
        key: `q-${q.id}`,
        kind: kindFromText(q.title) === "test" ? "test" : kindFromText(q.title) === "practice" ? "practice" : "quiz",
        title: q.title,
        meta: `${n} questions`,
        status: done ? `Completed${score != null ? ` • ${score}/${n}` : ""}` : "Not started",
        created: q.created_at,
        sortDate: q.created_at,
        action: done ? "Review" : "Start",
        link: { to: "/quizzes/$quizId", params: { quizId: q.id } },
      });
    }
    const decks = new Map<string, { size: number; reviewed: number; correct: number; created: string }>();
    for (const c of cards) {
      const name = c.deck ?? "Earlier cards";
      const d = decks.get(name) ?? { size: 0, reviewed: 0, correct: 0, created: c.created_at };
      d.size += 1;
      d.reviewed += c.times_reviewed;
      d.correct += c.times_correct;
      if (c.created_at < d.created) d.created = c.created_at;
      decks.set(name, d);
    }
    for (const [name, d] of decks) {
      const pct = d.reviewed ? Math.round((d.correct / d.reviewed) * 100) : 0;
      out.push({
        key: `f-${name}`,
        kind: "flashcards",
        title: name,
        meta: `${d.size} cards`,
        status: d.reviewed ? `${pct}% mastered` : "Not studied yet",
        created: d.created,
        sortDate: d.created,
        action: "Study",
        link: { to: "/flashcards/$deck", params: { deck: encodeURIComponent(name) } },
      });
    }
    for (const a of assignments) {
      const kind = kindFromText(a.category) ?? kindFromText(a.title) ?? "assignment";
      const graded = a.points_earned != null && a.points_possible != null;
      out.push({
        key: `a-${a.id}`,
        kind,
        title: a.title,
        meta: a.due_date ? `Due ${formatDate(a.due_date)}` : "No due date",
        status: graded
          ? `Score • ${a.points_earned}/${a.points_possible}`
          : a.status === "completed" ? "Done" : a.status === "in_progress" ? "In progress" : "Not started",
        created: a.created_at,
        sortDate: a.due_date ?? a.created_at,
        action: "Open",
        link: { to: "/assignments" },
      });
    }
    // Exams/tests on the calendar that aren't already an assignment.
    for (const e of events) {
      if (e.assignment_id) continue;
      const kind = kindFromText(e.event_type) ?? kindFromText(e.title);
      if (!kind) continue;
      out.push({
        key: `e-${e.id}`,
        kind,
        title: e.title,
        meta: `${LABEL[kind]} • ${formatDate(e.event_date)}`,
        status: e.event_date < new Date().toISOString().slice(0, 10) ? "Past" : "Upcoming",
        created: e.created_at,
        sortDate: e.event_date,
        action: "Open",
        link: { to: "/calendar" },
      });
    }
    return out.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  }, [quizzes, cards, assignments, events]);

  const shown = filter === "all" ? tasks : tasks.filter((t) => t.kind === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? tasks.length : tasks.filter((t) => t.kind === f.id).length;
          return (
            <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
              {f.label} <span className="opacity-70">{count}</span>
            </Button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Quizzes, flashcards and assignments you make for this class show up here.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((t) => (
            <li key={t.key} className="surface-card flex flex-col gap-2 p-4">
              <p className="font-display font-bold">
                <span className="mr-1.5">{ICON[t.kind]}</span>
                {t.title}
              </p>
              <p className="text-xs text-muted-foreground">{LABEL[t.kind]} • {t.meta}</p>
              <p className="text-sm">{t.status}</p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Made {formatDate(t.created.slice(0, 10))}</span>
                <Button asChild size="sm" variant="ghost">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Link to={t.link.to as any} params={t.link.params as any}>
                    {t.action} <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
