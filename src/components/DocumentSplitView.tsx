import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ExternalLink, Highlighter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignmentHelp, markupDocument } from "@/lib/ai.functions";
import { renderPdfPages, type RenderedPage } from "@/lib/pdf-render";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/Markdown";
import type { DocumentRow } from "@/lib/data";

type Marker = {
  n: number;
  label: string;
  note: string;
  quote?: string | null;
  page?: number;
  box?: { x: number; y: number; w: number; h: number } | null;
};

function readMarkers(value: unknown): Marker[] {
  if (!Array.isArray(value)) return [];
  return (value as Marker[]).filter((m) => m && typeof m.label === "string");
}


export function DocumentSplitView({
  document: doc,
  open,
  onOpenChange,
}: {
  document: DocumentRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [pagesBusy, setPagesBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const runHelp = useServerFn(assignmentHelp);
  const runMarkup = useServerFn(markupDocument);

  const isImage = (doc?.file_type ?? "").startsWith("image/");
  const isPdf = (doc?.file_type ?? "").includes("pdf") || (doc?.file_name ?? "").toLowerCase().endsWith(".pdf");

  useEffect(() => {
    setAnswer(doc?.ai_help ?? null);
    setMarkers(readMarkers(doc?.annotations));
    setActive(null);
    setUrl(null);
    setPages([]);
    if (!doc || !open) return;
    let alive = true;
    void supabase.storage
      .from("course-materials")
      .createSignedUrl(doc.storage_path, 3600)
      .then(async ({ data }) => {
        if (!alive) return;
        const signed = data?.signedUrl ?? null;
        setUrl(signed);
        if (!signed || !isPdf) return;
        setPagesBusy(true);
        try {
          const rendered = await renderPdfPages(signed, 3);
          if (alive) setPages(rendered);
        } catch {
          /* fall back to the embedded viewer */
        } finally {
          if (alive) setPagesBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [doc, open, isPdf]);

  const boxed = markers.filter((m) => m.box);

  async function ask() {
    if (!doc?.assignment_id) return;
    setBusy(true);
    try {
      const result = await runHelp({
        data: { assignmentId: doc.assignment_id, question: question || null },
      });
      setAnswer(result.reply);
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI could not help with this yet");
    } finally {
      setBusy(false);
    }
  }

  async function markUp() {
    if (!doc) return;
    setMarking(true);
    try {
      const result = await runMarkup({
        data: {
          documentId: doc.id,
          pageImages: pages.length ? pages.map((p) => p.dataUrl) : null,
        },
      });
      setMarkers(readMarkers(result.markers));
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark up this file");
    } finally {
      setMarking(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="truncate pr-8 text-left text-base">
            {doc?.file_name ?? "File"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[80vh] grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* Left: the file itself, with AI mark-up on top */}
          <div className="max-h-[40vh] overflow-auto border-b border-border bg-muted/40 p-3 md:max-h-[80vh] md:border-b-0 md:border-r">
            {!url ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : isImage ? (
              <div className="relative w-full">
                <img src={url} alt={doc?.file_name ?? "Uploaded file"} className="w-full rounded-lg" />
                {boxed.map((m) => (
                  <button
                    type="button"
                    key={m.n}
                    onClick={() => setActive(m.n)}
                    aria-label={`Marker ${m.n}: ${m.label}`}
                    className={`absolute rounded-md border-2 transition-colors ${
                      active === m.n
                        ? "border-primary bg-primary/25"
                        : "border-primary/70 bg-primary/10 hover:bg-primary/20"
                    }`}
                    style={{
                      left: `${m.box!.x * 100}%`,
                      top: `${m.box!.y * 100}%`,
                      width: `${m.box!.w * 100}%`,
                      height: `${m.box!.h * 100}%`,
                    }}
                  >
                    <span className="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {m.n}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <iframe src={url} title={doc?.file_name ?? "File"} className="h-[36vh] w-full rounded-lg border border-border bg-background md:h-[74vh]" />
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                  Open in new tab <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </div>

          {/* Right: AI mark-up + discussion */}
          <div className="max-h-[40vh] space-y-3 overflow-auto p-4 md:max-h-[80vh]">
            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => void markUp()}
              disabled={marking}
            >
              {marking ? <Loader2 className="size-4 animate-spin" /> : <Highlighter className="size-4" />}
              {markers.length ? "Mark it up again" : "Mark up this file"}
            </Button>

            {markers.length ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {isImage
                    ? "Tap a number on the file or in this list"
                    : "What the AI spotted in this file"}
                </p>
                <ol className="space-y-2">
                  {markers.map((m) => (
                    <li key={m.n}>
                      <button
                        type="button"
                        onClick={() => setActive(m.n)}
                        className={`surface-card flex w-full items-start gap-2 p-3 text-left transition-colors ${
                          active === m.n ? "border-primary" : ""
                        }`}
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {m.n}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{m.label}</span>
                          {m.quote ? (
                            <span className="mt-0.5 block text-xs italic text-muted-foreground">
                              “{m.quote}”
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-muted-foreground">{m.note}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Ask about this file…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button onClick={() => void ask()} disabled={busy || !doc?.assignment_id} className="gap-1.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Ask
              </Button>
            </div>
            {answer ? (
              <div className="surface-card p-4">
                <Markdown content={answer} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {doc?.assignment_id
                  ? "No saved AI work for this file yet. Ask a question and StudyMate saves the answer here."
                  : "Attach this file to an assignment to get AI help on it."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
