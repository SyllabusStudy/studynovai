import { showLimitIfQuota } from "@/components/LimitDialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  startLectureRecording,
  stopLectureRecording,
  takePendingRecording,
  useLectureRecorder,
} from "@/lib/lecture-recorder";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileAudio, FolderPlus, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { useActiveClass } from "@/lib/active-class";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createLectureNotes, transcribeLecturePiece } from "@/lib/lecture.functions";
import { prepareLectureAudio } from "@/lib/lecture-audio";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useGuestGate } from "@/lib/guest-gate";
import { ClearAllButton } from "@/components/ClearAllButton";
import { classLabel, formatDate, useClasses } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/lectures")({
  head: () => ({
    meta: [
      { title: "Lecture Notes — SyllabusStudy" },
      { name: "description", content: "Record or upload a lecture and get a transcript, study notes, flashcards and key exam concepts." },
      { property: "og:title", content: "Lecture Notes — SyllabusStudy" },
      { property: "og:description", content: "Turn a lecture recording into a study guide and flashcards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LecturesPage,
});

const MAX_BYTES = 500 * 1024 * 1024;

function LecturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const make = useServerFn(createLectureNotes);
  const transcribe = useServerFn(transcribeLecturePiece);
  const [stage, setStage] = useState("");
  const [classId, setClassId] = useState("none");
  const { recording, seconds, pending } = useLectureRecorder();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setActiveClassId } = useActiveClass();
  const [saving, setSaving] = useState<string | null>(null);
  const guest = useGuestGate("lectures");
  const [failed, setFailed] = useState<{ blob: Blob; name: string } | null>(null);


  const notes = useQuery({
    queryKey: ["lecture_notes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("lecture_notes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function process(blob: Blob, name: string) {
    if (guest.requireAccount()) {
      setFailed({ blob, name });
      return;
    }
    if (blob.size > MAX_BYTES) {
      toast.error("That file is too big (over 500 MB). Try a shorter recording.");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      setStage("Cleaning up the audio…");
      const pieces = await prepareLectureAudio(blob);
      const cls = classId === "none" ? null : classId;
      // Small pieces, a few at a time, each retried on its own — one hiccup never sinks the whole lecture.
      const total = pieces.length;
      const texts: (string | null)[] = new Array(total).fill(null);
      let done = 0;
      setStage(`Listening… 0 of ${total} part${total > 1 ? "s" : ""} done`);
      const fatal = (e: unknown) => e instanceof Error && /free limit|API key|did not allow/i.test(e.message);
      const runPiece = async (i: number) => {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const x = await transcribe({ data: { ...pieces[i]!, index: i, total } });
            texts[i] = x.text ?? "";
            done++;
            setStage(`Listening… ${done} of ${total} part${total > 1 ? "s" : ""} done`);
            return;
          } catch (e) {
            if (fatal(e)) throw e;
            lastErr = e;
            await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
          }
        }
        done++;
        console.warn("Lecture piece failed", i, lastErr);
      };
      // Index 0 first (checks the free limit), then the rest 3 at a time.
      await runPiece(0);
      let next = 1;
      await Promise.all(
        Array.from({ length: Math.min(3, total - 1) }, async () => {
          while (next < total) await runPiece(next++);
        }),
      );
      const failedParts = texts.filter((t) => t === null).length;
      const transcript = texts.filter(Boolean).join("\n\n").trim();
      if (!transcript) {
        throw new Error(
          failedParts === total
            ? "I’m having trouble connecting right now. Your recording is saved — tap Try again."
            : "We couldn't hear the professor in that recording. Try keeping the phone closer to the front.",
        );
      }
      setStage("Writing your study guide…");
      const r = await make({ data: { transcript, fileName: name, classId: cls } });
      toast.success(`Study guide ready${r.cards ? ` with ${r.cards} flashcards` : ""}`);
      setOpen(r.id);
      await qc.invalidateQueries();
    } catch (e) {
      setFailed({ blob, name });
      if (!showLimitIfQuota(e instanceof Error ? e.message : null)) toast.error(e instanceof Error ? e.message : "Couldn't make notes from that recording");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  async function start() {
    try {
      await startLectureRecording();
    } catch {
      toast.error("Allow microphone access to record your lecture.");
    }
  }

  function stop() {
    stopLectureRecording();
  }

  // When a recording finishes (here or while on another tab), make the notes.
  useEffect(() => {
    if (!pending) return;
    const p = takePendingRecording();
    if (p) void process(p.blob, p.name);
  }, [pending]);

  async function remove(id: string) {
    await supabase.from("lecture_notes").delete().eq("id", id);
    void notes.refetch();
  }

  async function removeAll() {
    if (!user?.id) return;
    const { error } = await supabase.from("lecture_notes").delete().eq("user_id", user.id);
    if (error) throw new Error(error.message);
    setOpen(null);
    await notes.refetch();
  }

  type Note = {
    id: string;
    title: string;
    class_id: string | null;
    document_id: string | null;
    summary: string;
    transcript: string;
    key_concepts: unknown;
    created_at: string;
    deck: string | null;
  };

  function noteText(n: Note) {
    const keys = Array.isArray(n.key_concepts) ? (n.key_concepts as string[]) : [];
    return [
      `# ${n.title}`,
      keys.length ? `## Key exam concepts\n${keys.map((k) => `- ${k}`).join("\n")}` : "",
      `## Study notes\n${n.summary}`,
      `## Full transcript\n${n.transcript}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** Opens a clean printable page — the student picks "Save as PDF". */
  function downloadPdf(n: Note) {
    const keys = Array.isArray(n.key_concepts) ? (n.key_concepts as string[]) : [];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(n.title)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;margin:40px;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 6px;color:#4338ca}
  .meta{color:#71717a;font-size:12px;margin-bottom:20px}
  li{margin:3px 0}pre{white-space:pre-wrap;font-family:inherit;font-size:13px;color:#3f3f46}
  @media print{body{margin:24px}}
</style></head><body>
<h1>${escapeHtml(n.title)}</h1>
<div class="meta">SyllabusStudy lecture notes · ${escapeHtml(formatDate(n.created_at.slice(0, 10)))}${
      n.class_id ? ` · ${escapeHtml(classLabel(classes.find((c) => c.id === n.class_id)))}` : ""
    }</div>
${keys.length ? `<h2>Key exam concepts</h2><ul>${keys.map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul>` : ""}
<h2>Study notes</h2><pre>${escapeHtml(n.summary)}</pre>
<h2>Full transcript</h2><pre>${escapeHtml(n.transcript)}</pre>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups so the printable notes can open.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  /** Saves the notes into the class's materials so quizzes and flashcards can use them. */
  async function saveToClass(n: Note, targetClassId: string | null): Promise<string | null> {
    if (!user) return null;
    const cls = targetClassId ?? n.class_id;
    if (!cls) {
      toast.error("Pick a class for these notes first.");
      return null;
    }
    if (n.document_id && cls === n.class_id) return n.document_id;
    setSaving(n.id);
    try {
      const text = noteText(n);
      const fileName = `${n.title.replace(/[^\w .-]/g, "").slice(0, 80) || "Lecture"} (lecture notes).md`;
      const path = `${user.id}/${crypto.randomUUID()}-lecture-notes.md`;
      const blob = new Blob([text], { type: "text/markdown" });
      const up = await supabase.storage.from("course-materials").upload(path, blob);
      if (up.error) throw new Error(up.error.message);
      const { data: doc, error } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          class_id: cls,
          file_name: fileName,
          file_type: "text/markdown",
          file_size: blob.size,
          storage_path: path,
          extracted_text: text,
          processing_status: "ready",
          is_syllabus: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabase.from("lecture_notes").update({ class_id: cls, document_id: doc.id }).eq("id", n.id);
      await qc.invalidateQueries();
      toast.success("Saved to that class's materials");
      return doc.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save these notes to the class");
      return null;
    } finally {
      setSaving(null);
    }
  }

  async function useFor(n: Note, where: "/quizzes" | "/flashcards") {
    const id = await saveToClass(n, null);
    if (!id) return;
    if (n.class_id) await setActiveClassId(n.class_id);
    void navigate({ to: where });
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {guest.dialog}
      <PageHeader title="Lecture Notes" description="Record class or upload a voice memo. SyllabusStudy writes the transcript, notes, flashcards and key exam concepts." />

      <div className="surface-card space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>Which class is this for?</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No class</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <Button variant="destructive" className="gap-1.5" onClick={stop}><Square className="size-4" /> Stop · {mmss} / 60:00</Button>
          ) : (
            <Button className="gap-1.5" disabled={busy} onClick={() => void start()}><Mic className="size-4" /> Record lecture</Button>
          )}
          <Button variant="outline" className="gap-1.5" disabled={busy || recording} onClick={() => fileRef.current?.click()}>
            <FileAudio className="size-4" /> Upload audio or video
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.mp4,.mov"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void process(f, f.name.replace(/\.[^.]+$/, ""));
              e.target.value = "";
            }}
          />
        </div>
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {stage || "Working on your lecture…"}</p>
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Your recording is saved here. Notes didn't finish.</span>
            <Button size="sm" onClick={() => void process(failed.blob, failed.name)}>Try again</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(failed.blob);
              a.download = `${failed.name}.${(failed.blob.type.split("/")[1] || "webm").split(";")[0]}`;
              a.click();
            }}><Download className="size-4" /> Save audio</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Keep the phone near the professor. Recordings up to 1 hour — it stops on its own at 60:00 and makes your notes. Ask your professor before recording.</p>
        )}
      </div>

      {(notes.data ?? []).length ? (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Your lecture notes</h2>
          <ClearAllButton
            label="saved lecture notes"
            count={(notes.data ?? []).length}
            description="Every lecture recording's notes and transcript will be removed from your account. This can't be undone."
            onClear={removeAll}
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {(notes.data ?? []).map((n) => (
          <div key={n.id} className="surface-card p-4">
            <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(open === n.id ? null : n.id)}>
              <div>
                <p className="font-display font-bold">🎙️ {n.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(n.created_at.slice(0, 10))}
                  {n.class_id ? ` · ${classLabel(classes.find((c) => c.id === n.class_id))}` : ""}
                </p>
              </div>
              <span className="text-xs text-primary">{open === n.id ? "Hide" : "Open"}</span>
            </button>
            {open === n.id ? (
              <div className="mt-4 space-y-4">
                {Array.isArray(n.key_concepts) && n.key_concepts.length ? (
                  <div>
                    <p className="text-sm font-semibold">Key exam concepts</p>
                    <ul className="mt-1 list-disc pl-5 text-sm">{(n.key_concepts as string[]).map((k) => <li key={k}>{k}</li>)}</ul>
                  </div>
                ) : null}
                <div><p className="text-sm font-semibold">Study notes</p><Markdown content={n.summary} /></div>
                <details><summary className="cursor-pointer text-sm font-semibold">Full transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.transcript}</p></details>
                <div className="space-y-1.5">
                  <Label className="text-xs">Save these notes to a class</Label>
                  <Select
                    value={n.class_id ?? "none"}
                    onValueChange={(v) => void saveToClass(n as Note, v === "none" ? null : v)}
                  >
                    <SelectTrigger className="max-w-xs"><SelectValue placeholder="Pick a class" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No class</SelectItem>
                      {classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {n.document_id
                      ? "Saved in this class's materials — you can build quizzes and flashcards from it."
                      : "Saving keeps a copy in the class so you can make quizzes and flashcards later."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {n.deck ? (
                    <Button asChild size="sm"><Link to="/flashcards/$deck" params={{ deck: encodeURIComponent(n.deck) }}>Study flashcards</Link></Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={saving === n.id} onClick={() => void useFor(n as Note, "/quizzes")}>
                    {saving === n.id ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />} Make a quiz
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={saving === n.id} onClick={() => void useFor(n as Note, "/flashcards")}>
                    <FolderPlus className="size-4" /> Make flashcards
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadPdf(n as Note)}>
                    <Download className="size-4" /> Save as PDF
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void remove(n.id)}><Trash2 className="size-4" /> Delete</Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
