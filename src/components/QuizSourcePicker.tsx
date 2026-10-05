import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Doc = { id: string; file_name: string; extracted_text?: string | null; processing_status?: string | null; category?: string | null };

export function QuizSourcePicker({
  classId,
  className,
  documents,
  documentIds,
  lectureIds,
  onChange,
}: {
  classId: string;
  className: string;
  documents: Doc[];
  documentIds: string[];
  lectureIds: string[];
  onChange: (docs: string[], lectures: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [docs, setDocs] = useState<string[]>([]);
  const [lecs, setLecs] = useState<string[]>([]);

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

  useEffect(() => {
    if (!open) return;
    setDocs(documentIds);
    setLecs(lectureIds);
    setMode(documentIds.length || lectureIds.length ? "pick" : "all");
  }, [open, documentIds, lectureIds]);

  const usableDoc = (d: Doc) => (d.extracted_text ?? "").trim().length > 0;
  const usableLec = (l: { summary: string | null; transcript: string | null }) =>
    `${l.summary ?? ""}${l.transcript ?? ""}`.trim().length > 40;

  const names = [
    ...documents.filter((d) => documentIds.includes(d.id)).map((d) => d.file_name),
    ...lectures.filter((l) => lectureIds.includes(l.id)).map((l) => l.title),
  ];
  const picked = names.length > 0;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">2 · Source material</p>
      {!classId ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">Pick a class first.</p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose source material</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Choose the notes, documents, or lecture notes you want your quiz to use.</p>

          <div className="grid gap-2">
            {(["all", "pick"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
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
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes & documents</p>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No uploads for this class yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {documents.map((d) => {
                      const ok = usableDoc(d);
                      return (
                        <li key={d.id}>
                          <label className={cn("flex items-center gap-2.5 rounded-lg p-2 text-sm hover:bg-muted/50", !ok && "opacity-60")}>
                            <Checkbox disabled={!ok} checked={docs.includes(d.id)} onCheckedChange={() => toggle(docs, setDocs, d.id)} />
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
                            {!ok && <span className="text-xs text-muted-foreground">{d.processing_status === "failed" ? "Couldn't read" : "Still reading…"}</span>}
                          </label>
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
                          <label className={cn("flex items-center gap-2.5 rounded-lg p-2 text-sm hover:bg-muted/50", !ok && "opacity-60")}>
                            <Checkbox disabled={!ok} checked={lecs.includes(l.id)} onCheckedChange={() => toggle(lecs, setLecs, l.id)} />
                            <Mic className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{l.title}</span>
                            {!ok && <span className="text-xs text-muted-foreground">No usable notes</span>}
                          </label>
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={mode === "pick" && docs.length + lecs.length === 0}
              onClick={() => {
                if (mode === "all") onChange([], []);
                else onChange(docs, lecs);
                setOpen(false);
              }}
            >
              Use selected material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
