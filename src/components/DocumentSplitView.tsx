import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignmentHelp } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/Markdown";
import type { DocumentRow } from "@/lib/data";

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
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const runHelp = useServerFn(assignmentHelp);

  useEffect(() => {
    setAnswer(doc?.ai_help ?? null);
    setUrl(null);
    if (!doc || !open) return;
    let alive = true;
    void supabase.storage
      .from("course-materials")
      .createSignedUrl(doc.storage_path, 3600)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [doc, open]);

  const isImage = (doc?.file_type ?? "").startsWith("image/");

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="truncate pr-8 text-left text-base">
            {doc?.file_name ?? "File"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[80vh] grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* Left: the file itself */}
          <div className="max-h-[40vh] overflow-auto border-b border-border bg-muted/40 p-3 md:max-h-[80vh] md:border-b-0 md:border-r">
            {!url ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : isImage ? (
              <img src={url} alt={doc?.file_name ?? "Uploaded file"} className="w-full rounded-lg" />
            ) : (
              <div className="space-y-2">
                <iframe src={url} title={doc?.file_name ?? "File"} className="h-[36vh] w-full rounded-lg border border-border bg-background md:h-[74vh]" />
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                  Open in new tab <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </div>

          {/* Right: AI discussion */}
          <div className="max-h-[40vh] space-y-3 overflow-auto p-4 md:max-h-[80vh]">
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
