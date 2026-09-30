import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createLectureNotes } from "@/lib/lecture.functions";
import { bytesToB64 } from "@/lib/lecture-audio";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { classLabel, formatDate, useClasses } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/lectures")({
  head: () => ({
    meta: [
      { title: "Lecture Notes — StudyNova" },
      { name: "description", content: "Record or upload a lecture and get a transcript, study notes, flashcards and key exam concepts." },
      { property: "og:title", content: "Lecture Notes — StudyNova" },
      { property: "og:description", content: "Turn a lecture recording into a study guide and flashcards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LecturesPage,
});

const MAX_BYTES = 19 * 1024 * 1024;

function LecturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const make = useServerFn(createLectureNotes);
  const [classId, setClassId] = useState("none");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (blob.size > MAX_BYTES) {
      toast.error("That recording is too long. Keep it under about 40 minutes (19 MB), or split it.");
      return;
    }
    setBusy(true);
    try {
      const audio = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
      const mimeType = (blob.type || "audio/mpeg").split(";")[0]!.trim().toLowerCase();
      const r = await make({ data: { audio, mimeType, fileName: name, classId: classId === "none" ? null : classId } });
      toast.success(`Study guide ready${r.cards ? ` with ${r.cards} flashcards` : ""}`);
      setOpen(r.id);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make notes from that recording");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void process(new Blob(chunks, { type: mr.mimeType || "audio/webm" }), `Lecture ${new Date().toLocaleDateString()}`);
      };
      mr.start(1000);
      rec.current = mr;
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Allow microphone access to record your lecture.");
    }
  }

  function stop() {
    rec.current?.stop();
    if (timer.current) window.clearInterval(timer.current);
    setRecording(false);
  }

  async function remove(id: string) {
    await supabase.from("lecture_notes").delete().eq("id", id);
    void notes.refetch();
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Lecture Notes" description="Record class or upload a voice memo. StudyNova writes the transcript, notes, flashcards and key exam concepts." />

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
            <Button variant="destructive" className="gap-1.5" onClick={stop}><Square className="size-4" /> Stop · {mmss}</Button>
          ) : (
            <Button className="gap-1.5" disabled={busy} onClick={() => void start()}><Mic className="size-4" /> Record lecture</Button>
          )}
          <Button variant="outline" className="gap-1.5" disabled={busy || recording} onClick={() => fileRef.current?.click()}>
            <FileAudio className="size-4" /> Upload voice memo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void process(f, f.name.replace(/\.[^.]+$/, ""));
              e.target.value = "";
            }}
          />
        </div>
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Listening to the lecture and writing your study guide… this can take a minute.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Keep the phone near the professor. Recordings up to about 40 minutes work best. Ask your professor before recording.</p>
        )}
      </div>

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
                <div className="flex flex-wrap gap-2">
                  {n.deck ? (
                    <Button asChild size="sm"><Link to="/flashcards/$deck" params={{ deck: encodeURIComponent(n.deck) }}>Study flashcards</Link></Button>
                  ) : null}
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
