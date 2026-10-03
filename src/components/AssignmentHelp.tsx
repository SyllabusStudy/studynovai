import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const FOLLOW_UPS = [
  "Explain that in simpler words",
  "What formula did you use?",
  "Show me a similar example",
];
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
  const memKey = `studynova.assignhelp.v1:${assignmentId}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const { data: docs = [] } = useAssignmentDocuments(user?.id, open ? assignmentId : undefined);
  const runHelp = useServerFn(assignmentHelp);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(memKey);
      if (raw) setMessages(JSON.parse(raw) as Msg[]);
    } catch {
      /* ignore */
    }
  }, [memKey]);

  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(memKey, JSON.stringify(messages));
      else sessionStorage.removeItem(memKey);
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, memKey]);

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

  async function ask(text: string) {
    const q = text.trim();
    if (busy || (messages.length > 0 && !q)) return;
    const history = messages;
    setBusy(true);
    setQuestion("");
    setMessages([...history, { role: "user", content: q || "Walk me through the whole thing." }]);
    try {
      const result = await runHelp({ data: { assignmentId, question: q || null, history } });
      setMessages((m) => [...m, { role: "assistant", content: result.reply }]);
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      setMessages(history);
      setQuestion(q);
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
                Pick a category so SyllabusStudy files its saved work under the right kind of task.
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
              hint="SyllabusStudy reads it, then walks you through the questions — no extra clicks."
            />
            <Hint id="assignment-open-file" point="down">
              Click a file name below to open it side by side — your PDF or image on the left, the
              AI's explanation on the right.
            </Hint>
            <DocumentList documents={docs} onSelect={(d) => setSelected(d)} />

            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="surface-card p-4">
                      <Markdown content={m.content} />
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>
            ) : null}

            {messages.length > 0 && !busy ? (
              <div className="flex flex-wrap gap-2">
                {FOLLOW_UPS.map((f) => (
                  <Button key={f} type="button" variant="outline" size="sm" className="h-auto py-1 text-xs" onClick={() => void ask(f)}>
                    {f}
                  </Button>
                ))}
              </div>
            ) : null}

            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <Input
                placeholder={messages.length ? "Ask a follow-up…" : "Optional: which question are you stuck on?"}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button type="submit" disabled={busy || (messages.length > 0 && !question.trim())} className="gap-1.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {messages.length ? "Send" : "Help me with this"}
              </Button>
            </form>
            {messages.length > 0 ? (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setMessages([])}>
                Start over
              </button>
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
