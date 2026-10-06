import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createPersonalNote, listPersonalNotes } from "@/lib/notes.functions";

export function ClassNotes({ userId, classId }: { userId: string | undefined; classId: string }) {
  const list = useServerFn(listPersonalNotes);
  const create = useServerFn(createPersonalNote);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const notes = useQuery({ queryKey: ["personal-notes", userId], queryFn: () => list(), enabled: !!userId });
  const mine = (notes.data ?? []).filter((n) => n.class_id === classId);

  async function newNote() {
    setBusy(true);
    try {
      const created = await create({ data: { classId } });
      await qc.invalidateQueries({ queryKey: ["personal-notes", userId] });
      await navigate({ to: "/notes", search: { note: created.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Your note couldn't be created.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">📝 My notes for this class ({mine.length})</h2>
        <Button size="sm" onClick={newNote} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New note</Button>
      </div>
      {notes.isLoading ? <Loader2 className="size-5 animate-spin text-primary" /> : mine.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No notes saved to this class yet. Create one here, or pick this class inside any note.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((n) => (
            <Link key={n.id} to="/notes" search={{ note: n.id }} className="glass-card block rounded-2xl border p-4 transition hover:border-primary/50">
              <FileText className="mb-2 size-5 text-primary" />
              <h3 className="break-words font-display font-bold">{n.title}</h3>
              <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{n.plain_text || "Empty note"}</p>
              <p className="mt-3 text-xs text-muted-foreground">{new Date(n.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
