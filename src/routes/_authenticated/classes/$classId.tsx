import { useEffect } from "react";
import { useActiveClass } from "@/lib/active-class";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Brain, FileQuestion, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ClassDot } from "@/components/ClassBadge";
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { TutorChat } from "@/components/TutorChat";
import { ClassTasks } from "@/components/ClassTasks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
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
      { title: "Class workspace — StudyNova" },
      { name: "description", content: "Course materials, policies, deadlines and AI study tools for this class." },
      { property: "og:title", content: "Class workspace — StudyNova" },
      { property: "og:description", content: "Materials, policies and AI study tools for this class." },
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


  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ClassDot color={klass.color} /> {klass.class_name}
          </span>
        }
        description={[klass.course_code, klass.professor, klass.semester].filter(Boolean).join(" · ")}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to="/flashcards"><Brain className="size-4" /> Generate Flashcards</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/quizzes"><FileQuestion className="size-4" /> Create Quiz</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/tutor"><Bot className="size-4" /> Explain Material</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/snapquick">🤖 SnapQuick</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/quickvideo">🎥 QuickVideo</Link></Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="deadlines">Assignments</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="tutor">AI Tutor</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-5">
          <ClassTasks userId={user?.id} classId={classId} />
        </TabsContent>

        <TabsContent value="materials" className="mt-5 space-y-4">
          <DocumentUploader classId={classId} syllabusOnly title="Upload Syllabus" />
          <DocumentUploader classId={classId} />
          <DocumentList documents={documents} />
        </TabsContent>

        <TabsContent value="grades" className="mt-5">
          <p className="text-sm text-muted-foreground">Track scores and your running grade for every class on the Grades page.</p>
          <Button asChild size="sm" className="mt-3"><Link to="/grades">Open Grades</Link></Button>
        </TabsContent>

        <TabsContent value="deadlines" className="mt-5 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Assignments
            </h2>
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
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Exams & events
            </h2>
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

        <TabsContent value="overview" className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/50 px-4 py-3"><p className="text-lg font-bold">{assignments.filter((a) => a.status !== "completed").length}</p><p className="text-xs text-muted-foreground">Open tasks</p></div>
            <div className="rounded-lg bg-muted/50 px-4 py-3"><p className="text-lg font-bold">{documents.length}</p><p className="text-xs text-muted-foreground">Documents</p></div>
            <div className="rounded-lg bg-muted/50 px-4 py-3"><p className="text-lg font-bold">{flashcards.length}</p><p className="text-xs text-muted-foreground">Flashcards</p></div>
          </div>
          {allPolicies.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No policies extracted yet"
              description="Upload the syllabus and mark it as a syllabus — StudyNova will pull out the policies."
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {allPolicies.length} policies pulled from your syllabus.
              </p>
              <dl className="space-y-4">
                {allPolicies.map((p) => (
                  <div key={p.label} className="surface-card p-4">
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {p.label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-line break-words text-sm">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </TabsContent>



        <TabsContent value="tutor" className="mt-5">
          <TutorChat fixedClassId={classId} compact />
        </TabsContent>
      </Tabs>
    </div>
  );
}
