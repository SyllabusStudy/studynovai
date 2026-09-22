import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FileUp, Loader2, PencilLine, Save, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { processDocument } from "@/lib/ai.functions";
import { saveVideoWork, videoWorkHelp } from "@/lib/video.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const WORK_UPLOAD_TYPES = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,.txt,.md";

type Mode = "answer" | "rewrite" | "correct" | "improve";

const ACTIONS: { mode: Mode; label: string; icon: typeof Wand2 }[] = [
  { mode: "answer", label: "Answer the questions", icon: Sparkles },
  { mode: "rewrite", label: "Rewrite it", icon: PencilLine },
  { mode: "correct", label: "Correct it", icon: CheckCheck },
  { mode: "improve", label: "Improve with the video", icon: Wand2 },
];

export function VideoWorkspace({
  noteId,
  classId,
  initialDraft,
  initialFileName,
}: {
  noteId: string;
  classId: string | null;
  initialDraft: string;
  initialFileName: string | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [fileName, setFileName] = useState<string | null>(initialFileName);
  const [instruction, setInstruction] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const save = useServerFn(saveVideoWork);
  const help = useServerFn(videoWorkHelp);
  const extract = useServerFn(processDocument);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
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
          is_syllabus: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await extract({ data: { documentId: row.id } });
      const { data: doc } = await supabase
        .from("documents")
        .select("extracted_text")
        .eq("id", row.id)
        .single();

      const text = doc?.extracted_text ?? "";
      const nextDraft = draft.trim() ? draft : text;
      setDraft(nextDraft);
      setFileName(file.name);
      await save({
        data: { videoNoteId: noteId, documentId: row.id, fileName: file.name, draft: nextDraft },
      });
      await qc.invalidateQueries({ queryKey: ["video_note", noteId] });
      toast.success(
        text
          ? `${file.name} loaded — edit it below and let the AI help`
          : `${file.name} attached. Type your work below and the AI will use the file plus the video.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await save({ data: { videoNoteId: noteId, draft } });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function run(mode: Mode) {
    if (!draft.trim()) {
      toast.error("Upload your assignment or type something first.");
      return;
    }
    setBusy(mode);
    setAdvice(null);
    try {
      const result = await help({
        data: { videoNoteId: noteId, mode, draft, instruction: instruction || null },
      });
      if (result.draft) {
        setDraft(result.draft);
        toast.success("Your document was updated — check the changes before you turn it in.");
      } else if (result.reply) {
        setAdvice(result.reply);
      }
      await qc.invalidateQueries({ queryKey: ["video_note", noteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The AI could not help with that");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="surface-card space-y-4 p-5">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <PencilLine className="size-4 text-primary" /> Work on your assignment with this video
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload your assignment (PDF, Word doc or a photo), edit it here, and let StudyMate answer,
          rewrite or correct it using the video.
        </p>
      </div>

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
          "rounded-xl border border-dashed border-border bg-card/60 p-4 text-center transition-colors",
          dragging && "border-primary bg-secondary/60",
        )}
      >
        <FileUp className="mx-auto size-5 text-primary" />
        <p className="mt-2 text-sm font-semibold">
          {fileName ? fileName : "Drop your assignment here"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">DOC, DOCX, PDF, image or text file.</p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {fileName ? "Replace file" : "Choose file"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={WORK_UPLOAD_TYPES}
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="work-draft">Your document</Label>
        <Textarea
          id="work-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          placeholder="Your assignment text shows up here after uploading — or just start typing."
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="work-instruction">What should the AI do? (optional)</Label>
        <Input
          id="work-instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. answer questions 3-7 using the video, keep it under a page"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ mode, label, icon: Icon }) => (
          <Button
            key={mode}
            size="sm"
            variant={mode === "answer" ? "default" : "secondary"}
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void run(mode)}
          >
            {busy === mode ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={saving} onClick={() => void saveDraft()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>

      {advice ? (
        <div className="rounded-xl bg-secondary/60 p-4">
          <Markdown content={advice} />
        </div>
      ) : null}
    </div>
  );
}
