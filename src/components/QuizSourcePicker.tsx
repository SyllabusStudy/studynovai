import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Mic, NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Doc = { id: string; file_name: string; extracted_text?: string | null; processing_status?: string | null; category?: string | null };

export function QuizSourcePicker({
  classId,
  className,
  documents,
  documentIds,
  lectureIds,
  noteIds,
  onChange,
}: {
  classId: string;
  className: string;
  documents: Doc[];
  documentIds: string[];
  lectureIds: string[];
  noteIds: string[];
  onChange: (docs: string[], lectures: string[], notes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [docs, setDocs] = useState<string[]>([]);
  const [lecs, setLecs] = useState<string[]>([]);
  const [nts, setNts] = useState<string[]>([]);
  const { data: myNotes = [] } = useQuery({
    queryKey: ["quiz-personal-notes", classId],
    enabled: Boolean(classId),
    queryFn: async () => {
      const { data } = await supabase.from("personal_notes").select("id,title,plain_text").eq("class_id", classId).order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: lectures = [] } = useQuery({
    queryKey: ["quiz-lectures", classId],
    enabled: Boolean(classId),
    queryFn: async () => {
      const { data } = await supabase
        .from("lecture_notes")
        .select("id,title,summary,transcript")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const openPicker = () => {
    setDocs(documentIds);
    setLecs(lectureIds);
    setNts(noteIds);
    setMode(documentIds.length || lectureIds.length || noteIds.length ? "pick" : "all");
    setOpen(true);
  };

  const usableDoc = (d: Doc) => (d.extracted_text ?? "").trim().length > 0;
  const usableLec = (l: { summary: string | null; transcript: string | null }) =>
    `${l.summary ?? ""}${l.transcript ?? ""}`.trim().length > 40;

  const names = [
    ...documents.filter((d) => documentIds.includes(d.id)).map((d) => d.file_name),
    ...lectures.filter((l) => lectureIds.includes(l.id)).map((l) => l.title),
    ...myNotes.filter((n) => noteIds.includes(n.id)).map((n) => n.title),
  ];
  const picked = names.length > 0;

  // Every tap saves right away — closing the box (X) keeps the selection.
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const toggleNote = (id: string) => { const n = flip(nts, id); setNts(n); onChange(docs, lecs, n); };
  const toggleDoc = (id: string) => { const n = flip(docs, id); setDocs(n); onChange(n, lecs, nts); };
  const toggleLec = (id: string) => { const n = flip(lecs, id); setLecs(n); onChange(docs, n, nts); };
  const chooseMode = (m: "all" | "pick") => {
    setMode(m);
    if (m === "all") onChange([], [], []);
    else onChange(docs, lecs, nts);
  };
  const count = docs.length + lecs.length + nts.length;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">2 · Source material</p>
      {!classId ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">Pick a class first.</p>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-left transition-colors hover:border-primary hover:bg-primary/15"
        >
          <BookOpen className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{picked ? `${names.length} material${names.length === 1 ? "" : "s"} selected` : "All notes"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {picked
                ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? `, +${names.length - 2} more` : ""}`
                : `All available materials from ${className}`}
            </p>
          </div>
          <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Change</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid-cols-1 w-[calc(100vw-1.5rem)] max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="pr-6">Choose source material</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Tap to pick. It saves as you go — tap X when you're done.</p>

          <div className="grid gap-2">
            {(["all", "pick"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold transition-colors",
                  mode === m ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                )}
              >
                <span className={cn("size-4 rounded-full border-2", mode === m ? "border-primary bg-primary" : "border-muted-foreground")} />
                {m === "all" ? "All notes" : "Select specific notes, documents or lecture notes"}
              </button>
            ))}
          </div>

          {mode === "pick" && (
            <div className="space-y-4">
              <section>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">My notes</p>
                {myNotes.length === 0 ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border p-2.5 text-sm">
                    <span className="text-muted-foreground">No notes saved to this class yet.</span>
                    <Button asChild size="sm" variant="outline"><Link to="/notes">Open Notes</Link></Button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {myNotes.map((n) => {
                      const ok = (n.plain_text ?? "").trim().length > 20;
                      return (
                        <li key={n.id}>
                          <button type="button" disabled={!ok} onClick={() => toggleNote(n.id)} className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left text-sm hover:bg-muted/50", nts.includes(n.id) && "bg-primary/10", !ok && "opacity-60")}>
                            <Checkbox tabIndex={-1} disabled={!ok} checked={nts.includes(n.id)} className="pointer-events-none" />
                            <NotebookPen className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{n.title}</span>
                            {!ok && <span className="text-xs text-muted-foreground">Too short</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes & documents</p>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No uploads for this class yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {documents.map((d) => {
                      const ok = usableDoc(d);
                      return (
                        <li key={d.id}>
                          <button type="button" disabled={!ok} onClick={() => toggleDoc(d.id)} className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left text-sm hover:bg-muted/50", docs.includes(d.id) && "bg-primary/10", !ok && "opacity-60")}>
                            <Checkbox tabIndex={-1} disabled={!ok} checked={docs.includes(d.id)} className="pointer-events-none" />
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
                            {!ok && <span className="text-xs text-muted-foreground">{d.processing_status === "failed" ? "Couldn't read" : "Still reading…"}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Lecture notes</p>
                {lectures.length === 0 ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border p-2.5 text-sm">
                    <span className="text-muted-foreground">No lecture notes available yet.</span>
                    <Button asChild size="sm" variant="outline"><Link to="/lectures">Add Lecture Notes</Link></Button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {lectures.map((l) => {
                      const ok = usableLec(l);
                      return (
                        <li key={l.id}>
                          <button type="button" disabled={!ok} onClick={() => toggleLec(l.id)} className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left text-sm hover:bg-muted/50", lecs.includes(l.id) && "bg-primary/10", !ok && "opacity-60")}>
                            <Checkbox tabIndex={-1} disabled={!ok} checked={lecs.includes(l.id)} className="pointer-events-none" />
                            <Mic className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{l.title}</span>
                            {!ok && <span className="text-xs text-muted-foreground">No usable notes</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {lectures.length > 0 && lectures.every((l) => !usableLec(l)) && (
                  <p className="mt-1 text-xs text-muted-foreground">We couldn't process these lecture notes yet. Try again or upload the notes manually.</p>
                )}
              </section>
            </div>
          )}

          <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 text-sm backdrop-blur sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
            <span className="min-w-0 truncate font-semibold text-primary">
              {mode === "all" || count === 0 ? "Using all notes ✓" : `${count} selected · saved ✓`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
