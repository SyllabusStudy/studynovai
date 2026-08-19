import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileVideo, Loader2, Sparkles, Upload, Video, Youtube } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DeleteButton } from "@/components/DeleteButton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importVideo } from "@/lib/video.functions";
import { useAuth } from "@/lib/auth";
import { classLabel, formatDate, useClasses, useVideoNotes } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/quickvideo/")({
  head: () => ({
    meta: [
      { title: "QuickVideo — AI notes from any video — StudyMate AI" },
      {
        name: "description",
        content:
          "Paste a YouTube link or upload a lecture recording and QuickVideo writes your study notes, then answers questions about the video.",
      },
      { property: "og:title", content: "QuickVideo — StudyMate AI" },
      {
        property: "og:description",
        content: "Import any video and get instant AI study notes you can ask questions about.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuickVideoPage,
});

const MAX_UPLOAD_MB = 24;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that video file."));
    reader.readAsDataURL(file);
  });
}

function QuickVideoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: classes = [] } = useClasses(user?.id);
  const { data: notes = [], isLoading } = useVideoNotes(user?.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [classId, setClassId] = useState("none");
  const [busy, setBusy] = useState(false);
  const run = useServerFn(importVideo);

  async function submit(payload: { url?: string; dataUrl?: string; fileName?: string }) {
    setBusy(true);
    try {
      const result = await run({
        data: {
          url: payload.url ?? null,
          dataUrl: payload.dataUrl ?? null,
          fileName: payload.fileName ?? null,
          classId: classId === "none" ? null : classId,
        },
      });
      await qc.invalidateQueries({ queryKey: ["video_notes"] });
      toast.success("Notes are ready");
      setUrl("");
      void navigate({ to: "/quickvideo/$noteId", params: { noteId: result.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "QuickVideo could not read that video");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is too big. Upload under ${MAX_UPLOAD_MB}MB, or paste a link instead.`);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      await submit({ dataUrl, fileName: file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    }
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from("video_notes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["video_notes"] });
  }

  return (
    <div>
      <PageHeader
        title="QuickVideo"
        description="Drop in a YouTube link or a lecture recording. StudyMate watches it, writes your notes, then answers anything you ask about it."
      />

      <div className="surface-card grid gap-4 p-5 lg:grid-cols-[1fr_minmax(0,14rem)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="qv-url">Video link</Label>
          <div className="relative">
            <Youtube className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="qv-url"
              className="pl-9"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) void submit({ url: url.trim() });
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            YouTube, Vimeo or any direct video link. Or upload a recording under {MAX_UPLOAD_MB}MB.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Class (optional)</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger>
              <SelectValue placeholder="No class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No class</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            className="gap-1.5"
            disabled={busy || !url.trim()}
            onClick={() => void submit({ url: url.trim() })}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Take notes
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> Upload video
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files)}
          />
        </div>
      </div>

      {busy ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Watching the video and writing your notes…
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your videos…</p>
        ) : notes.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No videos yet"
            description="Paste a lecture, review session or YouTube explainer above and QuickVideo turns it into notes."
          />
        ) : (
          notes.map((n) => (
            <div key={n.id} className="surface-card flex items-start gap-3 p-4">
              <FileVideo className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/quickvideo/$noteId"
                  params={{ noteId: n.id }}
                  className="block truncate font-semibold hover:underline"
                >
                  {n.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(n.created_at)} · {n.source_type === "upload" ? "Uploaded file" : "Link"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/quickvideo/$noteId" params={{ noteId: n.id }}>
                    Open notes
                  </Link>
                </Button>
                <DeleteButton
                  label="these video notes"
                  description="The notes and the chat about this video will be removed."
                  onDelete={() => deleteNote(n.id)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
