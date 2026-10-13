import { useNavigate } from "@tanstack/react-router";
import { FileQuestion, Flame, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveClass } from "@/lib/active-class";
import { classLabel, type AssignmentRow, type ClassRow, type EventRow } from "@/lib/data";
import { countdownLabel, upcomingExams } from "@/lib/exam-countdown";

export function ExamCountdown({
  assignments,
  events,
  classes,
  className,
}: {
  assignments: AssignmentRow[];
  events: EventRow[];
  classes: ClassRow[];
  className?: string;
}) {
  const navigate = useNavigate();
  const { setActiveClassId } = useActiveClass();
  const exams = upcomingExams(assignments, events).slice(0, 3);
  if (exams.length === 0) return null;

  const go = (classId: string | null, to: "/quizzes" | "/flashcards") => {
    if (classId) void setActiveClassId(classId);
    void navigate({ to });
  };

  return (
    <section className="dash-glass space-y-3 p-4 sm:p-5" aria-label="Upcoming exams">
      {exams.map((ex) => {
        const cls = classes.find((c) => c.id === ex.classId);
        const urgent = ex.days <= 3;
        const when = new Date(`${ex.date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        return (
          <div key={ex.key} className="flex flex-wrap items-center gap-3">
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground ${urgent ? "animate-pulse" : ""}`}
              style={{ background: urgent ? "var(--dash-amber)" : "var(--dash-violet)" }}
            >
              <Flame className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold">
                {cls ? `${classLabel(cls)} ` : ""}
                {ex.title}{" "}
                <span style={{ color: urgent ? "var(--dash-amber)" : undefined }} className="text-primary">
                  {countdownLabel(ex.days).toLowerCase()}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{when} — get ready with a 15-minute practice quiz.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl" onClick={() => go(ex.classId, "/quizzes")}>
                <FileQuestion className="size-4" /> Practice quiz
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl bg-transparent" onClick={() => go(ex.classId, "/flashcards")}>
                <Layers className="size-4" /> Flashcards
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
