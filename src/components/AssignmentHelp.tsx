import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const FOLLOW_UPS = [
  "Explain that in simpler words",
  "What formula did you use?",
  "Show me a similar example",
];
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, FileText, GraduationCap, Loader2, Pencil, Search, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignmentHelp } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { DocumentSplitView } from "@/components/DocumentSplitView";
import { ASSIGNMENT_CATEGORIES } from "@/lib/constants";
import { useAssignmentDocuments, useClasses, useDocuments, type DocumentRow } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
      {n}
    </span>
  );
}

function addedLabel(d: DocumentRow) {
  return `Added ${new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

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
  const { data: classes = [] } = useClasses(user?.id);
  const className = classes.find((c) => c.id === classId)?.class_name ?? null;
  const { data: docs = [] } = useAssignmentDocuments(user?.id, open ? assignmentId : undefined);
  const { data: allDocs = [] } = useDocuments(open ? user?.id : undefined, classId ?? undefined);
  const pastDocs = allDocs.filter((d) => d.assignment_id !== assignmentId && (d.extracted_text ?? "").trim().length > 0);
  const [refIds, setRefIds] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const runHelp = useServerFn(assignmentHelp);

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    if (!q) return pastDocs;
    return pastDocs.filter((d) => d.file_name.toLowerCase().includes(q));
  }, [pastDocs, noteQuery]);

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

  useEffect(() => {
    if (!open) {
      setNotesOpen(false);
      setNoteQuery("");
    }
  }, [open]);

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
  }

  async function ask(text: string) {
    const q = text.trim();
    if (busy || (messages.length > 0 && !q)) return;
    const history = messages;
    setBusy(true);
    setQuestion("");
    setMessages([...history, { role: "user", content: q || "Walk me through the whole thing." }]);
    try {
      const result = await runHelp({
        data: {
          assignmentId,
          question: q ? q.slice(0, 20000) : null,
          history: history.slice(-30).map((m) => ({ ...m, content: m.content.slice(0, 60000) })),
          referenceIds: refIds,
        },
      });
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

  const allShownOn = filteredNotes.length > 0 && filteredNotes.every((d) => refIds.includes(d.id));

  function toggleNote(id: string) {
    setRefIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id].slice(-12)));
  }

  function toggleSelectAll() {
    setRefIds((r) => (allShownOn ? r.filter((id) => !filteredNotes.some((d) => d.id === id)) : [...r, ...filteredNotes.map((d) => d.id)].slice(-12)));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" title="Need help? Ask AI about this assignment" aria-label="Ask AI About This Assignment">
            <Sparkles className="size-4" /> <span className="hidden sm:inline">Ask AI About This</span><span className="sm:hidden">Ask AI</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <div className="sr-only">
            <DialogTitle>{title}</DialogTitle>
          </div>
          <div className="flex items-start gap-3 pr-6">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">AI Homework Helper</p>
              <p className="text-sm text-muted-foreground">Upload your homework, choose your class notes, and get AI help.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card/60 py-2 pl-3 pr-4">
                <GraduationCap className="size-4 shrink-0 text-primary" />
                <span className="shrink-0 text-sm font-semibold">Class</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {className ? `${className} / ${title}` : title}
                </span>
              </div>
              <Select value={category ?? ""} onValueChange={(v) => void setCategory(v)}>
                <SelectTrigger className="h-10 w-auto gap-1.5 rounded-full border-border bg-card/60 text-sm" aria-label="Assignment type">
                  <SelectValue placeholder="Type" />
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StepBadge n={1} />
                <p className="text-base font-bold">Upload your homework</p>
                <p className="ml-auto text-xs text-muted-foreground">Upload a PDF, photo, or worksheet from your teacher.</p>
              </div>
              <DocumentUploader
                variant="homework"
                assignmentId={assignmentId}
                classId={classId}
              />
              {docs.length > 0 ? <DocumentList documents={docs} onSelect={(d) => setSelected(d)} /> : null}
            </div>

            {pastDocs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StepBadge n={2} />
                  <div className="min-w-0">
                    <p className="text-base font-bold">Reflect on your class notes</p>
                    <p className="text-xs text-muted-foreground">Choose notes from this class that you want the AI to use.</p>
                  </div>
                  <button
                    type="button"
                    aria-expanded={notesOpen}
                    onClick={() => setNotesOpen((o) => !o)}
                    className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    {refIds.length > 0 ? `${refIds.length} note${refIds.length === 1 ? "" : "s"} selected` : "Select notes"}
                    <ChevronDown className={cn("size-4 transition-transform", notesOpen && "rotate-180")} />
                  </button>
                </div>
                {notesOpen ? (
                  <div className="overflow-hidden rounded-xl border border-border bg-card/40">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={noteQuery}
                          onChange={(e) => setNoteQuery(e.target.value)}
                          placeholder="Search notes..."
                          className="h-9 rounded-lg bg-transparent pl-9"
                          aria-label="Search notes"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        aria-pressed={allShownOn}
                        className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <span className={cn("flex size-4 items-center justify-center rounded border", allShownOn ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60")}>
                          {allShownOn ? <Check className="size-3" /> : null}
                        </span>
                        Select all
                      </button>
                    </div>
                    <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                      {filteredNotes.map((d) => {
                        const on = refIds.includes(d.id);
                        return (
                          <li key={d.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleNote(d.id)}
                              className={cn("flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/40", on && "bg-primary/5")}
                            >
                              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60")}>
                                {on ? <Check className="size-3.5" /> : null}
                              </span>
                              <FileText className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{d.file_name}</span>
                                <span className="block text-xs text-muted-foreground">{addedLabel(d)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {filteredNotes.length === 0 ? (
                        <li className="px-3 py-4 text-sm text-muted-foreground">No notes match that search.</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StepBadge n={3} />
                <p className="text-base font-bold">Anything specific you're stuck on?</p>
                <p className="text-sm text-muted-foreground">(optional)</p>
              </div>
              <div className="relative">
                <Pencil className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="e.g. Question 4 or explain this part..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="h-12 rounded-xl bg-card/60 pl-10 text-base"
                  aria-label={messages.length ? "Ask a follow-up" : "What you're stuck on"}
                />
              </div>
            </div>

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
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || (messages.length > 0 && !question.trim())} className="gap-2 rounded-xl">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {messages.length ? "Send" : "Help Me With This"}
                  {!busy ? <ArrowRight className="size-4" /> : null}
                </Button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" />
                AI will use your uploaded work {refIds.length > 0 ? `+ ${refIds.length} selected note${refIds.length === 1 ? "" : "s"} ` : ""}together.
              </p>
            </form>
            {messages.length > 0 && !busy ? (
              <button type="button" className="block w-full text-center text-xs text-muted-foreground underline" onClick={() => setMessages([])}>
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
