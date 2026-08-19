import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { assignmentHelp } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/Markdown";
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { useAssignmentDocuments } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export function AssignmentHelp({
  assignmentId,
  classId,
  title,
}: {
  assignmentId: string;
  classId: string | null;
  title: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const { data: docs = [] } = useAssignmentDocuments(user?.id, open ? assignmentId : undefined);
  const runHelp = useServerFn(assignmentHelp);

  async function ask() {
    setBusy(true);
    setAnswer(null);
    try {
      const result = await runHelp({ data: { assignmentId, question: question || null } });
      setAnswer(result.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI could not help with this yet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="shrink-0 gap-1.5">
          <Sparkles className="size-4" /> AI help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <DocumentUploader
            assignmentId={assignmentId}
            classId={classId}
            title="Attach the assignment (PDF or screenshot)"
            hint="StudyMate reads it, then walks you through the questions — no extra clicks."
          />
          <DocumentList documents={docs} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Optional: which question are you stuck on?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Button onClick={() => void ask()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Help me with this
            </Button>
          </div>

          {answer ? (
            <div className="surface-card p-4">
              <Markdown content={answer} />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
