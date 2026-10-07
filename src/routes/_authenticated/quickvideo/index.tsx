import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import helpImage from "@/assets/how-to-copy-youtube-link.png.asset.json";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClassPicker } from "@/lib/active-class";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpen, Bot, Camera, ClipboardList, FileQuestion, FileText, Layers, Lightbulb, Link2, Loader2, PlaySquare, Sparkles, Upload, Video, Youtube, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { EmptyState } from "@/components/EmptyState";
import { DeleteButton } from "@/components/DeleteButton";
import { ClearAllButton } from "@/components/ClearAllButton";
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
import { AiKeySetupBanner, useAiKeyRedirect, useAiKeyStatus, useSendToAiKeySetup } from "@/lib/ai-key-gate";
import { useGuestGate, useRestoredGuestDraft } from "@/lib/guest-gate";
import { readTabMemory, writeTabMemory } from "@/lib/tab-memory";

const MEMORY_SCOPE = "/quickvideo";

export const Route = createFileRoute("/_authenticated/quickvideo/")({
  head: () => ({
    meta: [
      { title: "AI Video Summarizer – Turn Videos Into Study Notes | SyllabusStudy" },
      {
        name: "description",
        content:
          "Turn YouTube videos and lectures into organized study notes with SyllabusStudy QuickVideo. Get AI-generated summaries and notes from videos in seconds.",
      },
      { name: "robots", content: "index, follow" },
      {
        property: "og:title",
        content: "AI Video Summarizer – Turn Videos Into Study Notes | SyllabusStudy",
      },
      {
        property: "og:description",
        content:
          "Turn YouTube videos and lectures into organized study notes with SyllabusStudy QuickVideo. Get AI-generated summaries and notes from videos in seconds.",
      },
      { property: "og:url", content: "https://syllabusstudy.com/quickvideo" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://syllabusstudy.com/quickvideo" }],
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
  const [classId, setClassId] = useClassPicker("none");
  const [busy, setBusy] = useState(false);
  const run = useServerFn(importVideo);
  const redirectForKey = useAiKeyRedirect();
  const { data: keyStatus } = useAiKeyStatus();
  const sendToKeySetup = useSendToAiKeySetup();
  const guest = useGuestGate("quickvideo");
  useRestoredGuestDraft("quickvideo", setUrl);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ytError, setYtError] = useState(false);

  // Keep the half-typed link while this tab stays open.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readTabMemory<{ url: string }>(MEMORY_SCOPE);
    if (saved?.url) setUrl(saved.url);
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    writeTabMemory(MEMORY_SCOPE, { url });
  }, [url]);

  async function submit(payload: { url?: string; dataUrl?: string; fileName?: string }) {
    if (guest.requireAccount({ text: payload.url ?? "" })) return;
    if (keyStatus?.hasKey === false) {
      sendToKeySetup();
      return;
    }
    setBusy(true);
    setYtError(false);
    try {
      void recordStudyActivity("quickvideo");
      const result = await Promise.race([
        run({
          data: {
            url: payload.url ?? null,
            dataUrl: payload.dataUrl ?? null,
            fileName: payload.fileName ?? null,
            classId: classId === "none" ? null : classId,
          },
        }),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error("That video took too long to read. Try copying the link a different way, or upload the file.")),
            4 * 60_000,
          ),
        ),
      ]);
      await qc.invalidateQueries({ queryKey: ["video_notes"] });
      toast.success("Notes are ready");
      setUrl("");
      void navigate({ to: "/quickvideo/$noteId", params: { noteId: result.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "QuickVideo could not read that video";
      if (redirectForKey(msg)) return;
      const isYt = !!payload.url && /youtu\.?be/i.test(payload.url);
      if (isYt && /youtube would not play|took too long|not a bot|sign in|no captions|could not be read from the link|copy the link/i.test(msg)) {
        setYtError(true);
        setHelpOpen(true);
      } else toast.error(msg);
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

  async function deleteAllNotes() {
    if (!user?.id) return;
    const { error } = await supabase.from("video_notes").delete().eq("user_id", user.id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["video_notes"] });
  }

  return (
    <div>
      {guest.dialog}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto p-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How to copy a YouTube link</DialogTitle>
            <DialogDescription>Three quick steps to grab the video link.</DialogDescription>
          </DialogHeader>
          <img
            src={helpImage.url}
            alt="Step 1: tap Share on the video. Step 2: tap Copy. Step 3: paste the link into the Video link field here."
            className="mx-auto max-h-[60vh] w-full rounded-xl object-contain"
            loading="lazy"
          />
          <div className="space-y-1.5 rounded-lg bg-secondary/60 p-3">
            <p className="text-sm font-semibold">Other ways to copy the link</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                In the YouTube app, tap <span className="font-medium text-foreground">Share</span> →{" "}
                <span className="font-medium text-foreground">Copy link</span> — the short{" "}
                <span className="font-mono">youtu.be</span> link usually works best.
              </li>
              <li>On a computer, copy the web address at the top of the browser while the video is open.</li>
              <li>
                If it still won't load, strip extras off the link: keep only the{" "}
                <span className="font-mono">watch?v=…</span> part (remove <span className="font-mono">&list=…</span>,{" "}
                <span className="font-mono">&t=…</span> and anything after it).
              </li>
              <li>Copy it from the video's share button in the browser instead of the app — or the other way around.</li>
            </ul>
            <p className="pt-1 text-xs text-muted-foreground">
              Some videos can't be read no matter how the link is copied (private, age-restricted, or captions turned
              off). If that happens, download the video and use <span className="font-medium text-foreground">Upload video</span> instead —
              or upload the file later from the notes page.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <header className="surface-card mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/20 text-primary sm:size-20">
            <PlaySquare className="size-7 sm:size-10" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold sm:text-4xl">QuickVideo</h1>
            <p className="text-sm text-muted-foreground sm:text-lg">Turn lectures and YouTube videos into organized study notes.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="lg" className="gap-1.5">
          <Link to="/tutor"><Sparkles className="size-4 text-primary" /> <span className="hidden sm:inline">Ask AI</span></Link>
        </Button>
      </header>
      <AiKeySetupBanner />

      <Hint id="quickvideo-link" point="down" className="mb-4">
        Paste a YouTube lecture link here — SyllabusStudy writes the notes, then you can ask it
        anything about the video.
      </Hint>

      <div className="surface-card grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label>Choose your class <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="h-11">
                <span className="flex min-w-0 items-center gap-2"><BookOpen className="size-4 shrink-0 text-muted-foreground" /><SelectValue placeholder="No class" /></span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No class</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qv-url">Video link</Label>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="qv-url"
                className="h-11 border-primary/50 pl-9 pr-10"
                placeholder="Paste a YouTube link here..."
                value={url}
                disabled={busy}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) void submit({ url: url.trim() });
                }}
              />
              <Youtube className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-destructive" />
            </div>
            <button type="button" className="w-fit text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => setHelpOpen(true)}>
              ⓘ How do I copy a YouTube link?
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" className="h-14 gap-2 text-base" disabled={busy || !url.trim()} onClick={() => void submit({ url: url.trim() })}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Create Study Notes <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" size="lg" className="h-14 gap-3" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="size-5" />
              <span className="text-left leading-tight"><span className="block font-semibold">Upload Video</span><span className="block text-xs font-normal text-muted-foreground">MP4, MOV, under {MAX_UPLOAD_MB}MB</span></span>
            </Button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void pickFile(e.target.files)} />
          </div>
        </div>
        <div className="hidden flex-col justify-end rounded-2xl bg-muted/40 p-5 lg:flex">
          <div className="mb-5 flex items-center justify-center gap-4" aria-hidden="true">
            <div className="grid h-20 w-28 place-items-center rounded-lg border border-border bg-background"><Youtube className="size-8 text-destructive" /></div>
            <ArrowRight className="size-8 text-primary" />
            <div className="grid h-24 w-20 place-items-center rounded-lg border border-border bg-card"><FileText className="size-8 text-primary" /></div>
            <Sparkles className="size-6 text-warning" />
          </div>
          <p className="font-bold">Get study notes in seconds</p>
          <p className="mt-1 text-sm text-muted-foreground">Paste a YouTube link and SyllabusStudy will transcribe and organize it into clean, structured notes.</p>
        </div>
      </div>

      <section className="surface-card mt-5 p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Zap className="size-6 shrink-0 text-warning" />
            <div>
              <h2 className="font-bold">Quick Tools</h2>
              <p className="text-xs text-muted-foreground">Use the notes from your selected video to study faster.</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/studio">View all tools <ArrowRight className="size-3.5" /></Link></Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {([
            { label: "Generate Flashcards", to: "/flashcards", icon: Layers, tone: "text-success" },
            { label: "Quiz Me", to: "/quizzes", icon: FileQuestion, tone: "text-primary" },
            { label: "Create Quiz", to: "/quizzes", icon: ClipboardList, tone: "text-destructive" },
            { label: "Explain Notes", to: notes[0] ? "explain" : "/tutor", icon: Lightbulb, tone: "text-warning" },
            { label: "SnapQuick", to: "/snapquick", icon: Camera, tone: "text-accent" },
            { label: "AI Tutor", to: "/tutor", icon: Bot, tone: "text-primary" },
          ] as const).map((t) => {
            const cls = "flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted";
            const inner = <><t.icon className={`size-6 shrink-0 ${t.tone}`} /><span className="min-w-0 leading-tight">{t.label}</span></>;
            return t.to === "explain" && notes[0] ? (
              <Link key={t.label} to="/quickvideo/$noteId" params={{ noteId: notes[0].id }} className={cls}>{inner}</Link>
            ) : (
              <Link key={t.label} to={t.to === "explain" ? "/tutor" : t.to} className={cls}>{inner}</Link>
            );
          })}
        </div>
      </section>

      {busy ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Watching the video and writing your notes…
        </p>
      ) : null}

      {ytError && !busy ? (
        <div role="alert" className="surface-card mt-4 space-y-3 border-destructive/40 p-4">
          <div>
            <p className="font-semibold">YouTube may be blocking access to this video</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sometimes YouTube won't let us play or read a video from this link. Copying the link a different way
              usually fixes it — then try again. Private or age-restricted videos may need to be uploaded as a file.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" onClick={() => setHelpOpen(true)}>
              <Youtube className="size-4" /> How do I copy a YouTube video link?
            </Button>
            <Button variant="outline" disabled={!url.trim()} onClick={() => void submit({ url: url.trim() })}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => setYtError(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {notes.length ? (
        <div className="mt-6 mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Your Videos</h2>
          <ClearAllButton
            label="saved video notes"
            count={notes.length}
            description="Every set of video notes and its chat will be removed from your account. This can't be undone."
            onClear={deleteAllNotes}
          />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your videos…</p>
        ) : notes.length === 0 ? (
          <div className="surface-card flex flex-col items-center gap-3 p-8 text-center">
            <Video className="size-10 text-primary" />
            <p className="font-bold">No videos yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Paste a YouTube link or upload a lecture to create your first set of study notes.</p>
            <Button className="gap-1.5" onClick={() => document.getElementById("qv-url")?.focus()}><Sparkles className="size-4" /> Create Study Notes</Button>
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="surface-card flex items-start gap-3 p-4">
              {(n as { thumbnail_url?: string | null }).thumbnail_url ? (
                <img
                  src={(n as { thumbnail_url?: string | null }).thumbnail_url!}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-28 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <FileVideo className="mt-0.5 size-5 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to="/quickvideo/$noteId"
                  params={{ noteId: n.id }}
                  className="block truncate font-semibold hover:underline"
                >
                  {/^video notes$/i.test(n.title) ? "Untitled lecture video" : n.title}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {n.source_type === "upload" ? <Upload className="size-3.5 text-warning" /> : <Youtube className="size-3.5 text-destructive" />}
                  {n.source_type === "upload" ? "Uploaded" : "YouTube"} · {formatDate(n.created_at)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.summary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="sm" variant="outline" className="rounded-full text-primary">
                  <Link to="/quickvideo/$noteId" params={{ noteId: n.id }}>
                    <FileText className="size-4" /> <span className="hidden sm:inline">Open Notes</span>
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
