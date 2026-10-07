import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSyllabus, processDocument } from "@/lib/ai.functions";
import { ACCEPTED_UPLOAD_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CalendarSync } from "@/components/CalendarSync";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DocumentUploader({
  classId = null,
  syllabusOnly = false,
  assignmentId = null,
  category,
  title,
  hint,
  compact = false,
}: {
  classId?: string | null;
  syllabusOnly?: boolean;
  assignmentId?: string | null;
  category?: string | undefined;
  title?: string | undefined;
  hint?: string | undefined;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isSyllabus, setIsSyllabus] = useState(syllabusOnly);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runProcess = useServerFn(processDocument);
  const runSyllabus = useServerFn(analyzeSyllabus);
  const [stage, setStage] = useState<number | null>(null);
  const STAGES = ["Reading your syllabus...", "Finding assignments...", "Finding exam dates...", "Building your semester..."];


  const [pending, setPending] = useState<File[] | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncClassId, setSyncClassId] = useState<string | null>(null);

  function upload(files: FileList | null) {
    if (!files?.length || !user) return;
    const list = Array.from(files);
    if (inputRef.current) inputRef.current.value = "";
    if (syllabusOnly || isSyllabus) setPending(list);
    else void doUpload(list, "syllabus");
  }

  async function doUpload(files: File[], mode: "syllabus" | "canvas") {
    if (!user) return;
    const skipDates = mode === "canvas";
    let lastClass: string | null = classId;
    setBusy(true);
    try {
      for (const file of files) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("course-materials").upload(path, file);
        if (up.error) throw new Error(up.error.message);

        const { data: row, error } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            class_id: classId,
            assignment_id: assignmentId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type || null,
            storage_path: path,
            is_syllabus: syllabusOnly || isSyllabus,
            category:
              syllabusOnly || isSyllabus ? "syllabus" : (category ?? (assignmentId ? "assignment" : "notes")),
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        await qc.invalidateQueries({ queryKey: ["documents"] });
        try {
          if (syllabusOnly || isSyllabus) setStage(0);
          const processed = await runProcess({ data: { documentId: row.id } });
          if (syllabusOnly || isSyllabus) {
            setStage(1);
            const timer = setInterval(() => setStage((n) => (n === null ? n : Math.min(n + 1, 3))), 5000);
            const result = await runSyllabus({ data: { documentId: row.id, skipDates } }).finally(() => clearInterval(timer));
            await qc.invalidateQueries({ queryKey: ["events"] });
            await qc.invalidateQueries({ queryKey: ["assignments"] });
            await qc.invalidateQueries({ queryKey: ["class"] });
            await qc.invalidateQueries({ queryKey: ["classes"] });
            await qc.invalidateQueries({ queryKey: ["grade-categories"] });
            if (result?.createdClass) lastClass = result.createdClass.id;
            if (skipDates) {
              toast.success(result?.createdClass ? `Created "${result.createdClass.class_name}" — now sync your Canvas calendar` : `${file.name} saved — now sync your Canvas calendar`);
            } else if (result?.createdClass) {
              toast.success(`Created "${result.createdClass.class_name}" with ${result.eventsCreated} dates`);
            } else {
              toast.success(`${file.name}: added ${result?.eventsCreated ?? 0} dates to your calendar`);
            }
          } else if (processed?.renamedTo && processed?.linkedClass) {
            await qc.invalidateQueries({ queryKey: ["classes"] });
            toast.success(`Named "${processed.renamedTo}" and filed under ${processed.linkedClass.class_name}`);
          } else if (processed?.renamedTo) {
            toast.success(`Named "${processed.renamedTo}" from what's inside`);
          } else if (processed?.linkedClass) {
            await qc.invalidateQueries({ queryKey: ["classes"] });
            toast.success(`${file.name} filed under ${processed.linkedClass.class_name}`);
          } else {
            toast.success(`${file.name} processed`);
          }


        } catch (e) {
          toast.error(e instanceof Error ? e.message : "AI processing failed");
        }
        await qc.invalidateQueries({ queryKey: ["documents"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setStage(null);
      void lastClass;
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-xl border border-dashed border-border bg-card/60 transition-colors",
        compact ? "flex flex-col gap-3 p-4 sm:flex-row sm:items-center" : "p-6 text-center",
        dragging && "border-primary bg-secondary/60",
      )}
    >
      <FileUp className={cn("size-6 shrink-0 text-primary", compact ? "hidden sm:block" : "mx-auto")} />
      <div className={cn(compact && "min-w-0 flex-1")}>
      <p className={cn("text-sm font-semibold", !compact && "mt-3", compact && "text-base")}>
        {title ?? (syllabusOnly ? "Upload a syllabus" : "Upload your class materials")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hint ??
          (syllabusOnly
            ? "PDF, Word, slides or images. We fill in your exams, homework, dates and grade weights automatically."
            : "Add syllabi, notes, assignments, study guides, slides, and other files.")}
      </p>
      </div>
      {stage !== null ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary" aria-live="polite">
          <Loader2 className="size-4 animate-spin" /> {STAGES[stage]}
        </p>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-4", compact ? "sm:flex-row-reverse" : "mt-4 justify-center")}>
        <Button size={compact ? "default" : "sm"} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {compact ? "Upload Files" : "Choose files"}
        </Button>
        <div className={cn("flex items-center gap-2", (syllabusOnly || assignmentId) && "hidden")}>
          <Switch id="is-syllabus" checked={isSyllabus} onCheckedChange={setIsSyllabus} />
          <Label htmlFor="is-syllabus" className="text-xs">
            This is a syllabus
          </Label>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_UPLOAD_TYPES}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>How should we fill your calendar?</DialogTitle>
            <DialogDescription>
              Either way we still read the syllabus for the class info, grade weights, policies and books.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              className="h-auto flex-col items-start gap-0.5 py-3 text-left"
              onClick={() => { const f = pending!; setPending(null); void doUpload(f, "syllabus"); }}
            >
              <span className="font-semibold">Add dates from the syllabus</span>
              <span className="text-xs font-normal opacity-80">We pull exams, homework and due dates from the file.</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-3 text-left"
              onClick={() => { const f = pending!; setPending(null); void doUpload(f, "canvas"); sessionStorage.setItem("open-canvas-sync", classId ?? "auto"); void navigate({ to: "/calendar" }); }}
            >
              <span className="font-semibold">Sync my Canvas calendar</span>
              <span className="text-xs font-normal text-muted-foreground">Use your school's calendar for dates instead.</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {syncOpen ? (
        <CalendarSync open={syncOpen} onOpenChange={setSyncOpen} hideTrigger defaultClassId={syncClassId} />
      ) : null}
    </div>
  );
}
