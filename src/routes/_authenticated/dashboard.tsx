import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Bot, Brain, Camera, CalendarDays, CheckSquare, Flame, Loader2, Plus, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ClassChip } from "@/components/ClassBadge";
import { Markdown } from "@/components/Markdown";
import { InstallAppButton } from "@/components/InstallAppButton";
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
import { ClassActionBar } from "@/components/ClassActionBar";
import { useActiveClass } from "@/lib/active-class";
import { useRecordActivity, useStreak } from "@/lib/activity";
import { classifyEvent, eventDateTime, useNow } from "@/lib/dates";
import { useNavigate } from "@tanstack/react-router";

type CoachPlan = {
  summary?: string;
  tasks?: Array<{ time?: string; title?: string; detail?: string; minutes?: number; class?: string; tool?: string }>;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SyllabusNova" },
      { name: "description", content: "Your classes, upcoming deadlines and today's AI study plan." },
      { property: "og:title", content: "Dashboard — SyllabusNova" },
      { property: "og:description", content: "Upcoming deadlines and today's AI study plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const now = useNow();
  const navigate = useNavigate();
  const { setActiveClassId } = useActiveClass();
  const { data: streakData } = useStreak(user?.id);
  const record = useRecordActivity();
  const streak = streakData?.streak ?? 0;

  function studyNow(t: NonNullable<CoachPlan["tasks"]>[number]) {
    const match = classes.find(
      (c) => c.class_name.toLowerCase() === (t.class ?? "").toLowerCase() || (c.course_code ?? "").toLowerCase() === (t.class ?? "").toLowerCase(),
    );
    if (match) void setActiveClassId(match.id);
    record("study_session");
    const to = t.tool === "flashcards" ? "/flashcards" : t.tool === "quiz" ? "/quizzes" : "/tutor";
    void navigate({ to });
  }

  const open = assignments.filter((a) => a.status !== "completed");
  const upcoming = open
    .filter((a) => {
      const d = daysUntil(a.due_date);
      return d !== null && d <= 14;
    })
    .slice(0, 6);
  const nextEvents = events
    .filter((e) => classifyEvent(e.event_date, e.event_time, now) !== "past")
    .sort((a, b) => eventDateTime(a.event_date, a.event_time).getTime() - eventDateTime(b.event_date, b.event_time).getTime())
    .slice(0, 6);

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
    { icon: CalendarDays, label: "Events", value: nextEvents.length },
    { icon: Brain, label: "Flashcards", value: flashcards.length },
  ];

  const overdue = open.filter((a) => (daysUntil(a.due_date) ?? 0) < 0);
  const dueToday = open.filter((a) => daysUntil(a.due_date) === 0);
  const dueTomorrow = open.filter((a) => daysUntil(a.due_date) === 1);
  const upNext = upcoming.filter((a) => (daysUntil(a.due_date) ?? 0) > 1).slice(0, 4);
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile?.name?.split(" ")[0];

  const quick = [
    { to: "/assignments", label: "Add Assignment", icon: Plus },
    { to: "/classes", label: "Add Class", icon: Plus },
    { to: "/classes", label: "Upload Syllabus", icon: Upload },
    { to: "/tutor", label: "Ask AI Tutor", icon: Bot },
    { to: "/snapquick", label: "Scan Homework", icon: Camera },
  ] as const;

  const renderList = (title: string, list: typeof open, empty: string) => (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <span className={cn("text-xs font-bold", urgencyDot(daysUntil(a.due_date)))}>●</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground">{relativeDay(a.due_date)}</p>
              </div>
              {a.class_id ? (
                <ClassChip color={classById.get(a.class_id)?.color} label={classLabel(classById.get(a.class_id))} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4" data-tour="dashboard">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            {greeting}{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="mt-2 text-muted-foreground">Here's what needs your attention today.</p>
        </div>
        <div className="flex items-center gap-2">
          <InstallAppButton />
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold"
            title={
              streak > 0
                ? `Keep it going — you've studied ${streak} day${streak === 1 ? "" : "s"} in a row.`
                : "Study anything today to start a streak."
            }
          >
            <Flame className="size-3.5 text-warning" /> {streak} day streak
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {streak > 0
          ? `🔥 Keep it going — you've studied ${streak} day${streak === 1 ? "" : "s"} in a row.${streakData?.studiedToday ? "" : " Study something today to keep it."}`
          : "🔥 Study anything today to start your streak."}
      </p>

      <ClassActionBar className="mb-8" />

      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <Button key={q.label} asChild variant="outline" size="sm" className="rounded-full" data-tour={`quick-${q.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <Link to={q.to}>
              <q.icon className="size-4" /> {q.label}
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-5">
        <section className="surface-card min-w-0 p-5 sm:p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Today</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assignments">View All Assignments</Link>
            </Button>
          </div>
          {open.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Nothing on your plate"
              description="Add your first class to start building your semester."
              action={
                <Button asChild size="sm">
                  <Link to="/classes">+ Add Class</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {overdue.length ? renderList("Overdue", overdue, "") : null}
              {renderList("Due today", dueToday, "Nothing due today.")}
              {renderList("Due tomorrow", dueTomorrow, "Nothing due tomorrow.")}
              {renderList("Up next", upNext, "Nothing else in the next two weeks.")}
            </div>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-primary" /> Today's study plan
          </h2>
          {plan ? null : (
            <p className="mt-2 text-sm text-muted-foreground">
              I'll check your calendar and deadlines, then plan your day.
            </p>
          )}
          <Button className="mt-4 w-full" onClick={getPlan} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {plan ? "Regenerate plan" : "Build My Plan"}
          </Button>
          {plan ? (
            <div className="mt-4 space-y-3 text-sm">
              {plan.summary ? <Markdown content={plan.summary} /> : null}
              {plan.tasks?.length ? (
                <ul className="space-y-2">
                  {plan.tasks.map((t, i) => (
                    <li key={i} className="rounded-lg bg-muted/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {t.time ? <span className="mr-1.5 text-primary">{t.time} —</span> : null}
                          {t.title}
                        </p>
                        {t.minutes ? <span className="shrink-0 text-xs text-muted-foreground">{t.minutes} min</span> : null}
                      </div>
                      {t.class ? <p className="mt-0.5 text-xs text-muted-foreground">📚 {t.class}</p> : null}
                      {t.detail ? <p className="mt-1.5 text-sm">{t.detail}</p> : null}
                      <Button size="sm" variant="secondary" className="mt-2 h-8" onClick={() => studyNow(t)}>
                        Study Now
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button asChild variant="secondary" className="w-full">
                <Link to="/tutor" onClick={() => record("study_session")}>Start Study Session</Link>
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      {nextEvents.length ? (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Coming up on your calendar</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {nextEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
                <CalendarDays className="size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {relativeDay(e.event_date)}
                    {e.event_time ? ` · ${e.event_time}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Semester overview</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
              <s.icon className="size-4 text-primary" />
              <span className="text-lg font-bold">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
