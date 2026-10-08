import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { createPersonalNote, deletePersonalNote, getPersonalNote, listPersonalNotes, renamePersonalNote } from "@/lib/notes.functions";
import { PersonalNoteEditor } from "@/components/PersonalNoteEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useClasses } from "@/lib/data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/notes")({
  ssr: false,
  validateSearch: z.object({ note: z.string().uuid().optional().catch(undefined), ai: z.enum(["quiz", "flashcards"]).optional().catch(undefined) }),
  head: () => ({ meta: [
    { title: "My Notes — SyllabusStudy" },
    { name: "description", content: "Your private SyllabusStudy notes workspace with rich document editing and automatic saving." },
    { property: "og:title", content: "My Notes — SyllabusStudy" },
    { property: "og:description", content: "Write and organize your private study notes in SyllabusStudy." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: NotesPage,
});

function NotesPage() {
  const { user } = useAuth();
  const classes = useClasses(user?.id);
  const [classFilter, setClassFilter] = useState("all");
  const { note: noteId, ai } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listPersonalNotes);
  const get = useServerFn(getPersonalNote);
  const create = useServerFn(createPersonalNote);
  const rename = useServerFn(renamePersonalNote);
  const remove = useServerFn(deletePersonalNote);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ id: string; title: string; mode: "rename" | "delete" } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const notes = useQuery({ queryKey: ["personal-notes", user?.id], enabled: !!user && !noteId, queryFn: () => list() });
  const lastOpenKey = `studynova-notes-last-open:${user?.id ?? "anon"}`;
  // Remember the last open note; auto-reopen it only on the first visit to
  // /notes, never after the user explicitly backs out to the list.
  const triedReopen = useRef(false);
  useEffect(() => {
    if (noteId) { triedReopen.current = true; try { localStorage.setItem(lastOpenKey, noteId); } catch { /* ignore */ } return; }
    if (triedReopen.current) return;
    triedReopen.current = true;
    try {
      const saved = localStorage.getItem(lastOpenKey);
      if (saved) void navigate({ search: { note: saved }, replace: true });
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, lastOpenKey]);
  const opened = useQuery({ queryKey: ["personal-note", user?.id, noteId], enabled: !!user && !!noteId, queryFn: () => noteId ? get({ data: { id: noteId } }) : null, staleTime: 0 });

  async function newNote() {
    setBusy(true);
    try { const created = await create(); await qc.invalidateQueries({ queryKey: ["personal-notes", user?.id] }); await navigate({ search: { note: created.id } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Your note couldn't be created."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === "rename") await rename({ data: { id: dialog.id, title: newTitle.trim() } });
      else { await remove({ data: { id: dialog.id } }); try { if (localStorage.getItem(lastOpenKey) === dialog.id) localStorage.removeItem(lastOpenKey); } catch { /* ignore */ } }
      await qc.invalidateQueries({ queryKey: ["personal-notes", user?.id] });
      qc.removeQueries({ queryKey: ["personal-note", user?.id, dialog.id] });
      setDialog(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  if (!user) return null;
  if (noteId) {
    if (opened.isPending) return <div className="flex justify-center py-20" role="status"><Loader2 className="size-6 animate-spin text-primary" /><span className="sr-only">Loading note</span></div>;
    if (opened.error) return <div className="space-y-4 py-12 text-center"><p role="alert">{opened.error.message}</p><Button variant="outline" onClick={() => void opened.refetch()}>Try again</Button></div>;
    if (!opened.data) return <div className="space-y-4 py-12 text-center"><h1 className="font-display text-xl font-bold">Note unavailable</h1><Button asChild variant="outline"><Link to="/notes" search={{}}>Back to Notes</Link></Button></div>;
    return <PersonalNoteEditor key={opened.data.id} note={opened.data} initialAction={ai} />;
  }

  const filtered = (notes.data ?? []).filter(n => `${n.title} ${n.plain_text}`.toLowerCase().includes(search.toLowerCase()) && (classFilter === "all" || (classFilter === "none" ? !n.class_id : n.class_id === classFilter)));
  return <div className="mx-auto max-w-6xl">
    <div className="mb-6 flex items-center justify-between gap-3"><h1 className="font-display text-3xl font-extrabold">Notes</h1><Button onClick={() => void newNote()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}New note</Button></div>
    <div className="relative mb-6 max-w-xl"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search notes" placeholder="Search notes…" className="pl-10" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger aria-label="Filter notes by class" className="mb-6 w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All classes</SelectItem><SelectItem value="none">No class</SelectItem>{classes.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.course_code || c.class_name}</SelectItem>)}</SelectContent></Select>
    {notes.isPending ? <div className="py-12 text-center" role="status"><Loader2 className="mx-auto size-6 animate-spin text-primary" /><span className="sr-only">Loading notes</span></div> : notes.error ? <div className="space-y-3 py-12 text-center"><p role="alert">{notes.error.message}</p><Button variant="outline" onClick={() => void notes.refetch()}>Try again</Button></div> : filtered.length === 0 ? <div className="py-20 text-center"><FileText className="mx-auto mb-4 size-12 text-primary/60" /><h2 className="font-display text-xl font-bold">{search ? "No matching notes" : "Your notes"}</h2>{!search && <Button className="mt-5" variant="outline" disabled={busy} onClick={() => void newNote()}><Plus className="size-4" />Create a note</Button>}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(n => <article key={n.id} className="relative rounded-xl border border-border bg-card shadow-card transition-colors hover:border-primary/50">
      <Link to="/notes" search={{ note: n.id }} className="block min-h-48 p-5 pr-12"><FileText className="mb-4 size-6 text-primary" /><h2 className="break-words font-display font-bold">{n.title}</h2>{n.class_id && <span className="mt-2 inline-block rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{classes.data?.find(c => c.id === n.class_id)?.course_code || classes.data?.find(c => c.id === n.class_id)?.class_name || "Class note"}</span>}<p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{n.plain_text || "Empty note"}</p><p className="mt-4 text-xs text-muted-foreground">{new Date(n.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p></Link>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Options for ${n.title}`} className="absolute right-2 top-3"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setDialog({ ...n, mode: "rename" }); setNewTitle(n.title); }}><Pencil className="size-4" />Rename</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => setDialog({ ...n, mode: "delete" })}><Trash2 className="size-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </article>)}</div>}
    <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog?.mode === "rename" ? "Rename note" : "Delete note?"}</DialogTitle></DialogHeader>{dialog?.mode === "rename" ? <Input aria-label="New note title" maxLength={200} value={newTitle} onChange={e => setNewTitle(e.target.value)} /> : <p className="break-words text-sm text-muted-foreground">“{dialog?.title}” will be permanently deleted.</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button variant={dialog?.mode === "delete" ? "destructive" : "default"} disabled={busy || (dialog?.mode === "rename" && !newTitle.trim())} onClick={() => void confirm()}>{busy && <Loader2 className="size-4 animate-spin" />}{dialog?.mode === "rename" ? "Rename" : "Delete"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}