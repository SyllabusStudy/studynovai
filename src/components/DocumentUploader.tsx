import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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

export function DocumentUploader({
  classId = null,
  syllabusOnly = false,
  assignmentId = null,
  title,
  hint,
}: {
  classId?: string | null;
  syllabusOnly?: boolean;
  assignmentId?: string | null;
  title?: string;
  hint?: string;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isSyllabus, setIsSyllabus] = useState(syllabusOnly);
  const qc = useQueryClient();
  const runProcess = useServerFn(processDocument);
  const runSyllabus = useServerFn(analyzeSyllabus);


  async function upload(files: FileList | null) {
    if (!files?.length || !user) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("course-materials").upload(path, file);
        if (up.error) throw new Error(up.error.message);

        const { data: row, error } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            class_id: classId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type || null,
            storage_path: path,
            is_syllabus: syllabusOnly || isSyllabus,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        await qc.invalidateQueries({ queryKey: ["documents"] });
        try {
          await runProcess({ data: { documentId: row.id } });
          if (syllabusOnly || isSyllabus) {
            const result = await runSyllabus({ data: { documentId: row.id } });
            await qc.invalidateQueries({ queryKey: ["events"] });
            await qc.invalidateQueries({ queryKey: ["assignments"] });
            await qc.invalidateQueries({ queryKey: ["class"] });
            await qc.invalidateQueries({ queryKey: ["classes"] });
            await qc.invalidateQueries({ queryKey: ["grade-categories"] });
            if (result?.createdClass) {
              toast.success(`Created "${result.createdClass.class_name}" with ${result.eventsCreated} dates`);
            } else {
              toast.success(`${file.name}: added ${result?.eventsCreated ?? 0} dates to your calendar`);
            }
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
      if (inputRef.current) inputRef.current.value = "";
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
        "rounded-xl border border-dashed border-border bg-card/60 p-6 text-center transition-colors",
        dragging && "border-primary bg-secondary/60",
      )}
    >
      <FileUp className="mx-auto size-6 text-primary" />
      <p className="mt-3 text-sm font-semibold">
        {syllabusOnly ? "Drop a syllabus PDF here" : "Drop course materials here"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {syllabusOnly
          ? "We read the PDF, create the class, and fill in your exams, homework and grade weights automatically."
          : "PDF, images, slides, docs or notes. We extract the text for your AI tutor."}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Choose files
        </Button>
        <div className={cn("flex items-center gap-2", syllabusOnly && "hidden")}>
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
        onChange={(e) => void upload(e.target.files)}
      />
    </div>
  );
}
