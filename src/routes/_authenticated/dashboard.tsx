import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAiKeyStatus } from "@/lib/ai-key-gate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  FileText,
  Flame,
  Heart,
  Layers,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ClassChip } from "@/components/ClassBadge";
import { Markdown } from "@/components/Markdown";
import { InstallAppButton } from "@/components/InstallAppButton";
import { DailyInspiration } from "@/components/DailyInspiration";
import { ExamCountdown } from "@/components/ExamCountdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studyCoach } from "@/lib/ai.functions";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  classLabel,
  daysUntil,
  relativeDay,
  useAssignments,
  useClasses,
  useEvents,
  useProfile,
  useQuizzes,
  type AssignmentRow,
} from "@/lib/data";
import { classColorToken } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useActiveClass } from "@/lib/active-class";
import { useRecordActivity, useStreak } from "@/lib/activity";
import { useNow } from "@/lib/dates";
import { ClassCoverBg, ChangeCoverMenu } from "@/components/ClassCover";
import { coverFor, useCoverOverrides } from "@/lib/class-covers";

type CoachPlan = {
  summary?: string;
  tasks?: Array<{ time?: string; title?: string; detail?: string; minutes?: number; class?: string; tool?: string }>;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SyllabusStudy" },
      { name: "description", content: "Your classes, upcoming deadlines and today's AI study plan." },
      { property: "og:title", content: "Dashboard — SyllabusStudy" },
      { property: "og:description", content: "Upcoming deadlines and today's AI study plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfile(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const { data: assignments = [] } = useAssignments(user?.id);
  const overrides = useCoverOverrides();
  const { data: events = [] } = useEvents(user?.id);
  const { data: quizzes = [] } = useQuizzes(user?.id);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const coach = useServerFn(studyCoach);
  const now = useNow();
  const navigate = useNavigate();
  const { setActiveClassId } = useActiveClass();
  const { data: streakData } = useStreak(user?.id);
  const record = useRecordActivity();
  const streak = streakData?.streak ?? 0;
  const { data: keyStatus } = useAiKeyStatus();

  // Free-trial students stay on the dashboard; the app gate sends them to setup once uses run out.
  void keyStatus;

  // Real days studied in the last 7 days.
  const { data: weekDays = 0 } = useQuery({
    queryKey: ["study-week", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      const { data } = await supabase.from("study_activity").select("day").eq("user_id", user!.id).gte("day", dayKey(since));
      return new Set((data ?? []).map((r) => r.day)).size;
    },
  });

  const classById = new Map(classes.map((c) => [c.id, c]));
  const open = assignments.filter((a) => a.status !== "completed");
  const todayList = assignments
    .filter((a) => {
      const d = daysUntil(a.due_date);
      return d !== null && d <= 0 && (a.status !== "completed" || d === 0);
    })
    // Things due today come first, so old overdue work never pushes them off the card.
    .sort((x, y) => (daysUntil(y.due_date) ?? 0) - (daysUntil(x.due_date) ?? 0))
    .slice(0, 8);
  // Synced calendar items (Canvas/Blackboard, syllabus dates) due today that aren't already listed.
  const shownAssignments = new Set(todayList.map((a) => a.id));
  const todayEvents = events
    .filter((e) => daysUntil(e.event_date) === 0 && !(e.assignment_id && shownAssignments.has(e.assignment_id)))
    .slice(0, 8);
  const upcoming = open
    .filter((a) => {
      const d = daysUntil(a.due_date);
      return d !== null && d > 0 && d <= 14;
    })
    .slice(0, 5);

  const doneQuizzes = quizzes.filter((q) => q.completed_at && q.score !== null);
  const avgScore = doneQuizzes.length
    ? Math.round(doneQuizzes.reduce((s, q) => s + (q.score ?? 0), 0) / doneQuizzes.length)
    : null;

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile?.name?.split(" ")[0];

  async function toggle(a: AssignmentRow) {
    const done = a.status !== "completed";
    const { error } = await supabase.from("assignments").update({ status: done ? "completed" : "not_started" }).eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (done) record("assignment_done");
    await qc.invalidateQueries({ queryKey: ["assignments"] });
  }

  function studyNow(t: NonNullable<CoachPlan["tasks"]>[number]) {
    const match = classes.find(
      (c) => c.class_name.toLowerCase() === (t.class ?? "").toLowerCase() || (c.course_code ?? "").toLowerCase() === (t.class ?? "").toLowerCase(),
    );
    if (match) void setActiveClassId(match.id);
    record("study_session");
    const to = t.tool === "flashcards" ? "/flashcards" : t.tool === "quiz" ? "/quizzes" : "/tutor";
    void navigate({ to });
  }

  async function getPlan() {
    setBusy(true);
    try {
      const p = (await coach({ data: { minutes: 60 } })) as CoachPlan;
      if (!p?.summary && !p?.tasks?.length) throw new Error("The AI reply came back empty. Try again.");
      setPlan(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build a plan");
    } finally {
      setBusy(false);
    }
  }

  const quick = [
    { to: "/classes", title: "Upload Syllabus", desc: "Create your entire class in seconds.", icon: FileText, color: "var(--dash-violet)" },
    { to: "/quickvideo", title: "QuickVideo", desc: "Turn any YouTube video into study notes.", icon: Play, color: "var(--dash-blue)", badge: "New" },
    { to: "/flashcards", title: "Make Flashcards", desc: "Generate flashcards from your notes.", icon: Layers, color: "var(--dash-cyan)" },
    { to: "/tutor", title: "Ask AI", desc: "Get instant help on anything.", icon: Sparkles, color: "var(--dash-violet)" },
  ] as const;

  const stats = [
    { icon: Flame, value: streak, label: "Day Streak", color: "var(--dash-amber)" },
    { icon: CalendarCheck, value: `${weekDays}/7`, label: "Study Days", color: "var(--dash-blue)" },
    { icon: FileQuestion, value: doneQuizzes.length, label: "Quizzes Taken", color: "var(--dash-violet)" },
    { icon: BarChart3, value: avgScore === null ? "—" : `${avgScore}%`, label: "Avg. Score", color: "var(--dash-teal)" },
  ];

  return (
    <div className="dash w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          {/* Greeting */}
          <div className="flex flex-wrap items-start justify-between gap-4" data-tour="dashboard">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">
                <span className="dash-gradient-text">{greeting}{firstName ? `, ${firstName}` : ""}</span> 👋
              </h1>
              <p className="mt-2 text-base text-muted-foreground sm:text-lg">
                {streak > 0 ? (
                  <>You've studied <span className="font-semibold text-primary">{streak} day{streak === 1 ? "" : "s"} in a row</span>. Let's keep it going!</>
                ) : (
                  "Study anything today to start your streak."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <InstallAppButton />
              <Link to="/calendar" className="dash-glass inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
                <Flame className="size-4" style={{ color: "var(--dash-amber)" }} /> {streak} day streak
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </div>

          <ExamCountdown assignments={assignments} events={events} classes={classes} className="hidden md:block" />

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {quick.map((q) => (
              <Link
                key={q.title}
                to={q.to}
                className="dash-glass group relative flex min-h-36 flex-col p-4 transition hover:-translate-y-0.5 sm:p-5"
                data-tour={`quick-${q.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span
                  className="flex size-11 items-center justify-center rounded-xl text-primary-foreground"
                  style={{ background: q.color, boxShadow: `0 8px 24px -6px ${q.color}` }}
                >
                  <q.icon className="size-5" />
                </span>
                {"badge" in q ? (
                  <span className="absolute right-4 top-4 rounded-full bg-primary/25 px-2 py-0.5 text-xs font-semibold text-primary-foreground">{q.badge}</span>
                ) : null}
                <p className="mt-3 font-display text-base font-bold">{q.title}</p>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-xs text-muted-foreground sm:text-sm">{q.desc}</p>
                  <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-muted transition group-hover:bg-primary sm:flex">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* My Classes */}
          <section className="dash-glass p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold">My Classes</h2>
              <Button asChild variant="outline" size="sm" className="rounded-xl bg-transparent">
                <Link to="/classes"><Plus className="size-4" /> Add Class</Link>
              </Button>
            </div>
            {classes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Add your first class to start building your semester.</p>
            ) : (
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 scroll-slim sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
                {classes.map((c) => {
                  const list = assignments.filter((a) => a.class_id === c.id);
                  const done = list.filter((a) => a.status === "completed").length;
                  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
                  const col = classColorToken(c.color);
                  return (
                    <div
                      key={c.id}
                      className="group relative flex min-h-40 w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 sm:w-auto"
                    >
                      <ClassCoverBg src={coverFor(c, overrides)} />
                      <div className="relative flex items-start justify-between">
                        <span className="rounded-md bg-background/60 px-2 py-0.5 text-xs font-bold backdrop-blur">{classLabel(c)}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="rounded-md p-1 hover:bg-background/40" aria-label="Class options">
                            <MoreVertical className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild><Link to="/classes/$classId" params={{ classId: c.id }}>Open class</Link></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { void setActiveClassId(c.id); void navigate({ to: "/quizzes" }); }}>Make a quiz</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { void setActiveClassId(c.id); void navigate({ to: "/flashcards" }); }}>Make flashcards</DropdownMenuItem>
                            <ChangeCoverMenu classId={c.id} />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Link to="/classes/$classId" params={{ classId: c.id }} className="relative mt-auto block">
                        <p className="line-clamp-2 font-display text-lg font-bold leading-snug">{c.class_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{list.length} assignment{list.length === 1 ? "" : "s"}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/50">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
                          </div>
                          <span className="text-xs font-semibold">{pct}%</span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Today + Stats */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="dash-glass p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-xl font-bold">Today</h2>
                  <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <Link to="/assignments" className="text-sm font-semibold text-primary">View All</Link>
              </div>
              {todayList.length === 0 && todayEvents.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nothing due today. 🎉</p>
              ) : (
                <ul className="space-y-1">
                  {todayList.map((a) => {
                    const cls = a.class_id ? classById.get(a.class_id) : undefined;
                    const done = a.status === "completed";
                    const overdue = (daysUntil(a.due_date) ?? 0) < 0;
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                        <Checkbox checked={done} onCheckedChange={() => void toggle(a)} aria-label={`Mark ${a.title} done`} />
                        <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground line-through")}>{a.title}</span>
                        {cls ? <ClassChip color={cls.color} label={classLabel(cls)} /> : null}
                        <span className={cn("shrink-0 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                          {overdue ? "Overdue" : done ? "Done" : "Today"}
                        </span>
                      </li>
                    );
                  })}
                  {todayEvents.map((e) => {
                    const cls = e.class_id ? classById.get(e.class_id) : undefined;
                    return (
                      <li key={e.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                        <span className="size-4 shrink-0 rounded-full border-2 border-primary/60" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                        {cls ? <ClassChip color={cls.color} label={classLabel(cls)} /> : null}
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">{e.event_time || (e.event_type === "other" ? "Today" : e.event_type)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="dash-glass p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Study Stats</h2>
                <span className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">This Week</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-2xl bg-muted p-3">
                    <span
                      className="flex size-9 items-center justify-center rounded-lg"
                      style={{ background: `color-mix(in oklab, ${s.color} 22%, transparent)`, color: s.color }}
                    >
                      <s.icon className="size-4" />
                    </span>
                    <p className="mt-2 font-display text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* AI study plan (existing feature) */}
          <section className="dash-glass p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Sparkles className="size-5 text-primary" /> Today's study plan
              </h2>
              <Button onClick={getPlan} disabled={busy} className="rounded-xl">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {plan ? "Regenerate plan" : "Build My Plan"}
              </Button>
            </div>
            {plan ? (
              <div className="mt-4 space-y-3 text-sm">
                {plan.summary ? <Markdown content={plan.summary} /> : null}
                {plan.tasks?.length ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {plan.tasks.map((t, i) => (
                      <li key={i} className="rounded-xl bg-muted p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {t.time ? <span className="mr-1.5 text-primary">{t.time} —</span> : null}
                            {t.title}
                          </p>
                          {t.minutes ? <span className="shrink-0 text-xs text-muted-foreground">{t.minutes} min</span> : null}
                        </div>
                        {t.class ? <p className="mt-0.5 text-xs text-muted-foreground">📚 {t.class}</p> : null}
                        {t.detail ? <p className="mt-1.5 text-sm">{t.detail}</p> : null}
                        <Button size="sm" variant="secondary" className="mt-2 h-8" onClick={() => studyNow(t)}>Study Now</Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">I'll check your calendar and deadlines, then plan your day.</p>
            )}
          </section>
        </div>

        {/* Right column */}
        <aside className="min-w-0 space-y-6">
          <MiniCalendar now={now} marks={new Set([...assignments.map((a) => a.due_date), ...events.map((e) => e.event_date)].filter((d): d is string => !!d))} />

          <section className="dash-glass p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Upcoming</h2>
              <Link to="/assignments" className="text-sm font-semibold text-primary">View All</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due in the next two weeks.</p>
            ) : (
              <ul className="space-y-1">
                {upcoming.map((a) => {
                  const cls = a.class_id ? classById.get(a.class_id) : undefined;
                  const d = daysUntil(a.due_date) ?? 0;
                  const dot = d <= 2 ? "var(--destructive)" : d <= 4 ? "var(--dash-amber)" : "var(--dash-teal)";
                  return (
                    <li key={a.id}>
                      <Link to="/assignments" className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{a.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            {cls ? <ClassChip color={cls.color} label={classLabel(cls)} /> : null}
                            <span className="text-xs text-muted-foreground">{relativeDay(a.due_date)}</span>
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <DailyInspiration />
        </aside>
      </div>
    </div>
  );
}

function MiniCalendar({ now, marks }: { now: Date; marks: Set<string> }) {
  const [offset, setOffset] = useState(0);
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const cells = useMemo(() => {
    const first = base.getDay();
    const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  }, [base.getFullYear(), base.getMonth()]);
  const todayKey = dayKey(now);
  return (
    <section className="dash-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <Link to="/calendar" className="font-display text-lg font-bold">
          {base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Link>
        <div className="flex gap-1">
          <button className="rounded-lg bg-muted p-1.5" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month"><ChevronLeft className="size-4" /></button>
          <button className="rounded-lg bg-muted p-1.5" onClick={() => setOffset((o) => o + 1)} aria-label="Next month"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="pb-1 text-muted-foreground">{d}</span>
        ))}
        {cells.map((n, i) => {
          if (!n) return <span key={i} />;
          const k = dayKey(new Date(base.getFullYear(), base.getMonth(), n));
          const isToday = k === todayKey;
          return (
            <span key={i} className="flex flex-col items-center">
              <span className={cn("flex size-8 items-center justify-center rounded-full text-sm", isToday && "bg-primary font-bold text-primary-foreground")}>{n}</span>
              <span className={cn("size-1 rounded-full", marks.has(k) && !isToday ? "bg-primary" : "bg-transparent")} />
            </span>
          );
        })}
      </div>
    </section>
  );
}
