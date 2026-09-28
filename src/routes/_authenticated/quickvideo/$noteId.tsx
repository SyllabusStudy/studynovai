import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { VideoWorkspace } from "@/components/VideoWorkspace";
import { videoChat } from "@/lib/video.functions";
import { classLabel, formatDate, useClasses, useVideoNote } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/quickvideo/$noteId")({
  head: () => ({
    meta: [
      { title: "Video notes — QuickVideo — StudyNova" },
      {
        name: "description",
        content: "Read your AI video notes and ask follow-up questions about the video.",
      },
      { property: "og:title", content: "Video notes — StudyNova" },
      { property: "og:description", content: "AI notes from your imported video, with follow-up questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VideoNotePage,
});

type Turn = { role: "user" | "assistant"; content: string };

function VideoNotePage() {
  const { noteId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: note, isLoading } = useVideoNote(noteId);
  const { data: classes = [] } = useClasses(user?.id);
  const [chat, setChat] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(videoChat);

  useEffect(() => {
    if (note && Array.isArray(note.chat)) setChat(note.chat as unknown as Turn[]);
  }, [note]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setMessage("");
    setChat((c) => [...c, { role: "user", content: question }]);
    setBusy(true);
    try {
      const result = await ask({ data: { videoNoteId: noteId, message: question } });
      setChat(result.chat as Turn[]);
      void qc.invalidateQueries({ queryKey: ["video_note", noteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The AI could not answer that");
      setChat((c) => c.filter((t) => t.content !== question));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your notes…</p>;
  if (!note) return <p className="text-sm text-muted-foreground">Those notes were not found.</p>;

  const cls = classes.find((c) => c.id === note.class_id);

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
          <Link to="/quickvideo">
            <ArrowLeft className="size-4" /> All videos
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{/^video notes$/i.test(note.title) ? "Untitled lecture video" : note.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDate(note.created_at)}</span>
          {cls ? <span>· {classLabel(cls)}</span> : null}
          {note.source_url ? (
            <a
              href={note.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="size-3" /> Open the video
            </a>
          ) : null}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="surface-card p-5">
          <Markdown content={note.notes ?? ""} />
        </div>

        <div className="surface-card flex max-h-[36rem] flex-col p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> Ask about this video
          </p>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto scroll-slim pr-1">
            {chat.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask anything — "explain the part at 4:20", "what did they say about mitosis?", "quiz me on this".
              </p>
            ) : (
              chat.map((t, i) => (
                <div
                  key={`${i}-${t.role}`}
                  className={
                    t.role === "user"
                      ? "ml-auto max-w-[90%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                  }
                >
                  {t.role === "user" ? t.content : <Markdown content={t.content} />}
                </div>
              ))
            )}
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Thinking…
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Ask a question about the video"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(message);
              }}
            />
            <Button size="icon" disabled={busy || !message.trim()} onClick={() => void send(message)}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <VideoWorkspace
        key={note.id}
        noteId={note.id}
        classId={note.class_id}
        initialDraft={(note as { work_draft?: string | null }).work_draft ?? ""}
        initialFileName={(note as { work_file_name?: string | null }).work_file_name ?? null}
      />
    </div>
  );
}
