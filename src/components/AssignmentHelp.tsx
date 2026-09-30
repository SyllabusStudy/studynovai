import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignmentHelp } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/Markdown";
import { Hint } from "@/components/Hint";
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { DocumentSplitView } from "@/components/DocumentSplitView";
import { ASSIGNMENT_CATEGORIES } from "@/lib/constants";
import { useAssignmentDocuments, type DocumentRow } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export function AssignmentHelp({
  assignmentId,
  classId,
  title,
  category,
}: {
  assignmentId: string;
  classId: string | null;
  title: string;
  category?: string | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const { data: docs = [] } = useAssignmentDocuments(user?.id, open ? assignmentId : undefined);
  const runHelp = useServerFn(assignmentHelp);

  async function setCategory(value: string) {
    const { error } = await supabase
      .from("assignments")
      .update({ category: value })
      .eq("id", assignmentId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["assignments"] });
    toast.success("Category saved");
  }

  async function ask() {
    setBusy(true);
    setAnswer(null);
    try {
      const result = await runHelp({ data: { assignmentId, question: question || null } });
      setAnswer(result.reply);
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI could not help with this yet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" title="Need help? Ask AI about this assignment" aria-label="Ask AI About This Assignment">
            <Sparkles className="size-4" /> <span className="hidden sm:inline">Ask AI About This</span><span className="sm:hidden">Ask AI</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left">{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category (keeps AI work organized)</Label>
              <Hint id="assignment-category" point="down">
                Pick a category so SyllabusNova files its saved work under the right kind of task.
              </Hint>
              <Select value={category ?? ""} onValueChange={(v) => void setCategory(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DocumentUploader
              assignmentId={assignmentId}
              classId={classId}
              title="Attach the assignment (PDF or screenshot)"
              hint="SyllabusNova reads it, then walks you through the questions — no extra clicks."
            />
            <Hint id="assignment-open-file" point="down">
              Click a file name below to open it side by side — your PDF or image on the left, the
              AI's explanation on the right.
            </Hint>
            <DocumentList documents={docs} onSelect={(d) => setSelected(d)} />

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

      <DocumentSplitView
        document={selected}
        open={selected !== null}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      />
    </>
  );
}
