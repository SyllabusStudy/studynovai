import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { classLabel, useAssignments, useClasses, useEvents } from "@/lib/data";
import { downloadCsv, toCsv } from "@/lib/csv";

const HEADERS = [
  "type",
  "class",
  "course_code",
  "professor",
  "title",
  "date",
  "time",
  "category",
  "details",
];

/** Exports classes, syllabus dates and times as one spreadsheet-ready CSV. */
export function SyllabusCsvExport({
  classId,
  label = "Export syllabus CSV",
}: {
  classId?: string;
  label?: string;
}) {
  const { user } = useAuth();
  const { data: classes = [] } = useClasses(user?.id);
  const { data: events = [] } = useEvents(user?.id, classId);
  const { data: assignments = [] } = useAssignments(user?.id, classId);

  const scopedClasses = classId ? classes.filter((c) => c.id === classId) : classes;
  const byId = new Map(classes.map((c) => [c.id, c]));

  function exportCsv() {
    const rows: Array<Array<unknown>> = [];

    for (const c of scopedClasses) {
      rows.push([
        "class",
        c.class_name,
        c.course_code ?? "",
        c.professor ?? "",
        "",
        "",
        c.office_hours ?? "",
        c.semester ?? "",
        c.required_materials ?? "",
      ]);
    }
    for (const e of events) {
      rows.push([
        "event",
        e.class_id ? classLabel(byId.get(e.class_id)) : "",
        e.class_id ? (byId.get(e.class_id)?.course_code ?? "") : "",
        "",
        e.title,
        e.event_date,
        e.event_time ?? "",
        e.event_type,
        e.description ?? "",
      ]);
    }
    for (const a of assignments) {
      rows.push([
        "assignment",
        a.class_id ? classLabel(byId.get(a.class_id)) : "",
        a.class_id ? (byId.get(a.class_id)?.course_code ?? "") : "",
        "",
        a.title,
        a.due_date ?? "",
        "",
        a.category ?? a.status,
        a.description ?? "",
      ]);
    }

    if (rows.length === 0) {
      toast.error("Nothing to export yet — add a class or import a syllabus first.");
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`studymate-syllabus-${stamp}.csv`, toCsv(HEADERS, rows));
    toast.success(`Exported ${rows.length} rows.`);
  }

  return (
    <Button variant="outline" size="sm" onClick={exportCsv}>
      <Download className="size-4" />
      {label}
    </Button>
  );
}
