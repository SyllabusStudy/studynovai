import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Brain, CalendarDays, CheckSquare, Flame, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ClassChip } from "@/components/ClassBadge";
import { Markdown } from "@/components/Markdown";
import { InstallAppButton } from "@/components/InstallAppButton";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { studyCoach } from "@/lib/ai.functions";
import { useAuth } from "@/lib/auth";
import {
  classLabel,
  daysUntil,
  relativeDay,
  urgencyDot,
  useAssignments,
  useClasses,
  useEvents,
  useFlashcards,
  useProfile,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type CoachPlan = {
  summary?: string;
  tasks?: Array<{ title?: string; detail?: string; minutes?: number; class?: string }>;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StudyNova" },
      { name: "description", content: "Your classes, upcoming deadlines and today's AI study plan." },
      { property: "og:title", content: "Dashboard — StudyNova" },
      { property: "og:description", content: "Upcoming deadlines and today's AI study plan." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const { data: assignments = [] } = useAssignments(user?.id);
  const { data: events = [] } = useEvents(user?.id);
  const { data: flashcards = [] } = useFlashcards(user?.id);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const coach = useServerFn(studyCoach);

  const open = assignments.filter((a) => a.status !== "completed");
  const upcoming = open
    .filter((a) => {
      const d = daysUntil(a.due_date);
      return d !== null && d <= 14;
    })
    .slice(0, 6);
  const nextEvents = events
    .filter((e) => {
      const d = daysUntil(e.event_date);
      return d !== null && d >= 0;
    })
    .slice(0, 5);

  const classById = new Map(classes.map((c) => [c.id, c]));

  async function getPlan() {
    setBusy(true);
    try {
      const res = await coach({ data: { minutes: 60 } });
      const p = res as CoachPlan;
      if (!p?.summary && !p?.tasks?.length) throw new Error("The AI reply came back empty. Try again.");
      setPlan(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build a plan");
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    { icon: BookOpen, label: "Classes", value: classes.length },
    { icon: CheckSquare, label: "Open tasks", value: open.length },
    { icon: CalendarDays, label: "Upcoming events", value: nextEvents.length },
    { icon: Brain, label: "Flashcards", value: flashcards.length },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back${profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}`}
        description="Here's where your semester stands right now."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <InstallAppButton className="hidden sm:inline-flex" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">
              <Flame className="size-3.5 text-warning" /> {profile?.study_streak ?? 0} day streak
            </span>
          </div>
        }
      />

      <Hint id="dashboard-start" point="down" className="mb-4">
        This is your home base — stats update automatically, and the study plan pulls from every syllabus, assignment and note you've uploaded.
      </Hint>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface-card p-4">
            <s.icon className="size-4 text-primary" />
            <p className="mt-3 text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Due soon
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Nothing due in the next two weeks"
              description="Add a class and upload its syllabus — StudyNova will fill in your deadlines for you."
              action={
                <Button asChild size="sm">
                  <Link to="/classes">Go to my classes</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((a) => {
                const d = daysUntil(a.due_date);
                return (
                  <li key={a.id} className="surface-card flex items-center gap-3 p-4">
                    <span className={cn("text-xs font-bold", urgencyDot(d))}>●</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{relativeDay(a.due_date)}</p>
                    </div>
                    {a.class_id ? (
                      <ClassChip
                        color={classById.get(a.class_id)?.color}
                        label={classLabel(classById.get(a.class_id))}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Coming up on your calendar
          </h2>
          {nextEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events yet.</p>
          ) : (
            <ul className="space-y-2">
              {nextEvents.map((e) => (
                <li key={e.id} className="surface-card flex items-center gap-3 p-4">
                  <CalendarDays className="size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{relativeDay(e.event_date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="size-4 text-primary" /> Today's study plan
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Built from your deadlines, weak topics and course materials.
          </p>
          <Button size="sm" className="mt-4 w-full" onClick={getPlan} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {plan ? "Regenerate plan" : "Build my plan"}
          </Button>
          {plan ? (
            <div className="mt-4 space-y-3 text-sm">
              {plan.summary ? <Markdown content={plan.summary} /> : null}
              {plan.tasks?.length ? (
                <ul className="space-y-2">
                  {plan.tasks.map((t, i) => (
                    <li key={i} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{t.title}</p>
                        {t.minutes ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.minutes} min
                          </span>
                        ) : null}
                      </div>
                      {t.class ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.class}</p>
                      ) : null}
                      {t.detail ? <p className="mt-1.5 text-sm">{t.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
