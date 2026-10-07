import { useEffect, useState } from "react";
import { useActiveClass } from "@/lib/active-class";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, BookOpen, CalendarCheck, CalendarDays, Camera, ChevronRight, ClipboardList, Clock, FileQuestion,
  FileText, Layers, Lightbulb, Loader2, PlaySquare, Plus, ShieldCheck, Sparkles, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ClassDot } from "@/components/ClassBadge";
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { TutorChat } from "@/components/TutorChat";
import { ClassTasks } from "@/components/ClassTasks";
import { ClassNotes } from "@/components/ClassNotes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { MATERIAL_CATEGORIES } from "@/lib/constants";
import {
  formatDate,
  relativeDay,
  useAssignments,
  useClass,
  useDocuments,
  useEvents,
  useFlashcards,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class workspace — SyllabusStudy" },
      { name: "description", content: "Course materials, policies, deadlines and AI study tools for this class." },
      { property: "og:title", content: "Class workspace — SyllabusStudy" },
      { property: "og:description", content: "Materials, policies and AI study tools for this class." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassDetail,
});

function ClassDetail() {
  const { classId } = Route.useParams();
  const { setActiveClassId } = useActiveClass();
  useEffect(() => {
    void setActiveClassId(classId);
  }, [classId, setActiveClassId]);
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const { data: klass, isLoading } = useClass(classId);
  const { data: documents = [] } = useDocuments(user?.id, classId);
  const { data: assignments = [] } = useAssignments(user?.id, classId);
  const { data: events = [] } = useEvents(user?.id, classId);
  const { data: flashcards = [] } = useFlashcards(user?.id, classId);

  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;
  if (!klass) return <p className="text-sm text-muted-foreground">This class no longer exists.</p>;

  const policies = [
    { label: "Attendance", value: klass.attendance_policy },
    { label: "Late work", value: klass.late_work_policy },
    { label: "Make-up work", value: klass.makeup_policy },
    { label: "Office hours", value: klass.office_hours },
    { label: "Required materials", value: klass.required_materials },
  ].filter((p) => p.value);

  // Every policy the AI pulled out of the syllabi for this class.
  const detailed: Array<{ label: string; value: string }> = [];
  const seenPolicy = new Set(policies.map((p) => p.label.toLowerCase()));
  for (const d of documents) {
    const data = d.syllabus_data as
      | { policies?: Array<{ title?: string; details?: string }>; other_policies?: string | null }
      | null;
    for (const p of data?.policies ?? []) {
      if (!p?.title || !p?.details) continue;
      const key = p.title.trim().toLowerCase();
      if (seenPolicy.has(key)) continue;
      seenPolicy.add(key);
      detailed.push({ label: p.title.trim(), value: p.details.trim() });
    }
    if (data?.other_policies && !seenPolicy.has("other")) {
      seenPolicy.add("other");
      detailed.push({ label: "Other", value: data.other_policies });
    }
  }
  const allPolicies = [...policies, ...detailed] as Array<{ label: string; value: string }>;

  const openTasks = assignments.filter((a) => a.status !== "completed");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = openTasks
    .filter((a) => a.due_date && a.due_date >= today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 4);
  const recent = [...documents].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const policyIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("attend")) return { icon: CalendarCheck, tone: "text-destructive bg-destructive/15" };
    if (l.includes("late") || l.includes("make")) return { icon: Clock, tone: "text-warning bg-warning/15" };
    if (l.includes("office")) return { icon: Users, tone: "text-success bg-success/15" };
    if (l.includes("material") || l.includes("book")) return { icon: BookOpen, tone: "text-primary bg-primary/15" };
    return { icon: ShieldCheck, tone: "text-accent bg-accent/15" };
  };
  const tools = [
    { label: "Generate Flashcards", to: "/flashcards", icon: Layers, tone: "text-success" },
    { label: "Quiz Me", to: "/quizzes", icon: FileQuestion, tone: "text-primary" },
    { label: "Create Quiz", to: "/quizzes", icon: ClipboardList, tone: "text-destructive" },
    { label: "Explain Notes", to: "/tutor", icon: Lightbulb, tone: "text-warning" },
    { label: "SnapQuick", to: "/snapquick", icon: Camera, tone: "text-accent" },
    { label: "QuickVideo", to: "/quickvideo", icon: PlaySquare, tone: "text-primary" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Class header */}
      <header data-tour="page-header" className="surface-card grid grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-5 lg:flex lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/20 text-primary sm:size-20">
            <BookOpen className="size-7 sm:size-10" />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate font-display text-2xl font-extrabold sm:text-3xl">
              <ClassDot color={klass.color} /> <span className="truncate">{klass.class_name}</span>
            </h1>
            {klass.professor ? <p className="truncate text-base text-muted-foreground sm:text-lg">{klass.professor}</p> : null}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
              {klass.semester ? <span className="flex items-center gap-1.5"><CalendarDays className="size-4" /> {klass.semester}</span> : null}
              {klass.course_code ? <span className="flex items-center gap-1.5"><FileText className="size-4" /> {klass.course_code}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="flex-1 gap-1.5 sm:flex-none" onClick={() => setTab("materials")}><Plus className="size-4" /> Add Materials</Button>
          <Button size="lg" variant="outline" className="flex-1 gap-1.5 sm:flex-none" onClick={() => setTab("tutor")}><Sparkles className="size-4 text-primary" /> AI Tutor</Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
          {([["overview", "Overview"], ["deadlines", "Assignments"], ["notes", "Notes"], ["grades", "Grades"]] as const).map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* Quick tools */}
          <section className="surface-card p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Zap className="size-6 shrink-0 text-warning" />
                <div>
                  <h2 className="font-bold">Quick Tools</h2>
                  <p className="text-xs text-muted-foreground">Get started with your class materials</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/studio">View all tools <ArrowRight className="size-3.5" /></Link></Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {tools.map((t) => (
                <Link key={t.label} to={t.to} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted">
                  <t.icon className={`size-6 shrink-0 ${t.tone}`} /> <span className="min-w-0 leading-tight">{t.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { n: openTasks.length, l: "Open Tasks", icon: ClipboardList, tone: "text-accent bg-accent/15", go: "tasks" },
                  { n: documents.length, l: "Documents", icon: FileText, tone: "text-primary bg-primary/15", go: "materials" },
                  { n: flashcards.length, l: "Flashcards", icon: Layers, tone: "text-success bg-success/15", go: "flashcards" },
                ].map((s) => (
                  s.go === "flashcards" ? (
                    <Link key={s.l} to="/flashcards" className="surface-card flex items-center gap-3 p-3 transition hover:border-primary/50 sm:p-4">
                      <span className={`hidden size-12 shrink-0 place-items-center rounded-xl sm:grid ${s.tone}`}><s.icon className="size-6" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-2xl font-extrabold">{s.n}</span><span className="block truncate text-xs text-muted-foreground sm:text-sm">{s.l}</span></span>
                      <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                    </Link>
                  ) : (
                    <button key={s.l} type="button" onClick={() => setTab(s.go)} className="surface-card flex items-center gap-3 p-3 text-left transition hover:border-primary/50 sm:p-4">
                      <span className={`hidden size-12 shrink-0 place-items-center rounded-xl sm:grid ${s.tone}`}><s.icon className="size-6" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-2xl font-extrabold">{s.n}</span><span className="block truncate text-xs text-muted-foreground sm:text-sm">{s.l}</span></span>
                      <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                    </button>
                  )
                ))}
              </div>

              <DocumentUploader
                classId={classId}
                category="notes"
                compact
                title="Add class materials"
                hint="Upload notes, slides, study guides, PDFs, or images."
              />

              <section className="surface-card p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold"><FileText className="size-5 text-primary" /> Recent Materials</h2>
                  <button type="button" onClick={() => setTab("materials")} className="flex items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="size-3.5" /></button>
                </div>
                <DocumentList documents={recent} showActions />
              </section>
            </div>

            <div className="min-w-0 space-y-5">
              <section className="surface-card p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" /> Important Class Policies</h2>
                  {allPolicies.length > 3 ? (
                    <button type="button" onClick={() => setTab("policies")} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">View all {allPolicies.length} <ArrowRight className="size-3.5" /></button>
                  ) : null}
                </div>
                {allPolicies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Upload your syllabus and we'll pull out the policies.</p>
                ) : (
                  <ul className="space-y-2">
                    {allPolicies.slice(0, 3).map((p) => {
                      const { icon: Icon, tone } = policyIcon(p.label);
                      return (
                        <li key={p.label}>
                          <button type="button" onClick={() => setTab("policies")} className="flex w-full items-start gap-3 rounded-xl bg-muted/40 p-3 text-left transition hover:bg-muted">
                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
                            <span className="min-w-0"><span className="block text-sm font-bold">{p.label}</span><span className="line-clamp-2 text-xs text-muted-foreground">{p.value}</span></span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="surface-card p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold"><CalendarDays className="size-5 text-primary" /> Upcoming Assignments</h2>
                  <Link to="/assignments" className="flex items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="size-3.5" /></Link>
                </div>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing coming up. 🎉</p>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((a) => {
                      const days = Math.round((new Date(a.due_date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
                      return (
                        <li key={a.id}>
                          <Link to="/assignments" className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 transition hover:bg-muted">
                            <ClipboardList className="size-5 shrink-0 text-accent" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a.title}</span><span className="block text-xs text-muted-foreground">Due {formatDate(a.due_date)}</span></span>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${days <= 3 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>{relativeDay(a.due_date)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="mt-5 space-y-3">
          <button type="button" onClick={() => setTab("overview")} className="text-sm font-semibold text-primary">← Back to overview</button>
          {allPolicies.length === 0 ? (
            <EmptyState icon={FileText} title="No policies extracted yet" description="Upload the syllabus and mark it as a syllabus — SyllabusStudy will pull out the policies." />
          ) : (
            <dl className="space-y-3">
              {allPolicies.map((p) => (
                <div key={p.label} className="surface-card p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{p.label}</dt>
                  <dd className="mt-1 whitespace-pre-line break-words text-sm">{p.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-5 space-y-3">
          <button type="button" onClick={() => setTab("overview")} className="text-sm font-semibold text-primary">← Back to overview</button>
          <ClassTasks userId={user?.id} classId={classId} />
        </TabsContent>

        <TabsContent value="notes" className="mt-5">
          <ClassNotes userId={user?.id} classId={classId} />
        </TabsContent>

        <TabsContent value="materials" className="mt-5 space-y-8">
          <button type="button" onClick={() => setTab("overview")} className="text-sm font-semibold text-primary">← Back to overview</button>
          {MATERIAL_CATEGORIES.map((cat) => {
            const docs = documents.filter(
              (d) => (d.category ?? (d.is_syllabus ? "syllabus" : "notes")) === cat.key,
            );
            return (
              <section key={cat.key} className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  {cat.emoji} {cat.label} <span className="font-medium">({docs.length})</span>
                </h2>
                {cat.key === "syllabus" ? (
                  <DocumentUploader
                    classId={classId}
                    syllabusOnly
                    compact
                    title={docs.length ? "Upload another syllabus" : "Upload syllabus"}
                    hint={docs.length ? "Your original stays. New dates are added to your calendar." : "We fill in exams, due dates and grade weights."}
                  />
                ) : (
                  <DocumentUploader
                    classId={classId}
                    category={cat.key}
                    compact
                    title={cat.key === "notes" ? "Upload notes, slides or study guides" : cat.key === "assignment" ? "Upload assignment files" : "Upload anything else"}
                    hint="PDF, Word, PowerPoint, Excel, text, CSV or images."
                  />
                )}
                {cat.key === "assignment" ? (
                  <Button asChild size="sm" variant="outline"><Link to="/assignments">Add assignment</Link></Button>
                ) : null}
                {docs.length ? <DocumentList documents={docs} showActions /> : null}
              </section>
            );
          })}
        </TabsContent>

        <TabsContent value="grades" className="mt-5">
          <p className="text-sm text-muted-foreground">Track scores and your running grade for every class on the Grades page.</p>
          <Button asChild size="sm" className="mt-3"><Link to="/grades">Open Grades</Link></Button>
        </TabsContent>

        <TabsContent value="deadlines" className="mt-5 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Tasks</h2>
            <ClassTasks userId={user?.id} classId={classId} />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Assignments</h2>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className="surface-card flex items-center justify-between gap-3 p-4">
                    <span className="truncate text-sm font-semibold">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{relativeDay(a.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Exams & events</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="surface-card flex items-center justify-between gap-3 p-4">
                    <span className="truncate text-sm font-semibold">{e.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(e.event_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="tutor" className="mt-5">
          <TutorChat fixedClassId={classId} compact />
        </TabsContent>
      </Tabs>
    </div>
  );
}
