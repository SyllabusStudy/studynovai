import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NoteCorrections } from "@/lib/note-corrections";
import { NoteLineSpacing } from "@/lib/note-line-spacing";
import { TextStyle, FontSize, FontFamily } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { NoteImage, readNoteImage } from "@/lib/note-image";
import { NoteImageMenu } from "@/components/NoteImageMenu";
import { toast } from "sonner";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Brain, Check, HelpCircle, Lightbulb, Loader2, RotateCw } from "lucide-react";
import { savePersonalNote } from "@/lib/notes.functions";
import { NotesToolbar } from "@/components/NotesToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PersonalNote as Note, titleFromNotes } from "@/lib/personal-notes";
import { useClasses } from "@/lib/data";
import { NoteDrawingCanvas } from "@/components/NoteDrawingCanvas";
import { normalizeDrawing, type Drawing } from "@/lib/note-drawing";
import { Keyboard, PenTool, Sparkles } from "lucide-react";
import { NotesAiPanel } from "@/components/NotesAiPanel";
import type { DrawEl } from "@/lib/note-drawing";
import { ShareButton } from "@/components/ShareButton";
import type { Json } from "@/integrations/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EDITOR_TAB = Math.random().toString(36).slice(2);
/** True only if another browser tab/window currently has this same note open. */
function otherEditorOpen(id: string): Promise<boolean> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(false);
  return new Promise(resolve => {
    const ch = new BroadcastChannel("syllabusstudy-note-editors");
    const done = (v: boolean) => { clearTimeout(t); ch.close(); resolve(v); };
    const t = setTimeout(() => done(false), 400);
    ch.onmessage = ev => { const d = ev.data as { type?: string; id?: string; from?: string }; if (d?.type === "pong" && d.id === id && d.from !== EDITOR_TAB) done(true); };
    ch.postMessage({ type: "ping", id, from: EDITOR_TAB });
  });
}

export function PersonalNoteEditor({ note, initialAction }: { note: Note; initialAction?: "quiz" | "flashcards" | undefined }) {
  const save = useServerFn(savePersonalNote);
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [classId, setClassId] = useState<string | null>(note.class_id);
  const [autoTitle, setAutoTitle] = useState(note.title_is_auto);
  const classes = useClasses(note.user_id);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const revision = useRef(note.revision);
  const version = useRef(0);
  const persisted = useRef(0);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useRef({ title: note.title, contentJson: JSON.stringify(note.content), plainText: note.plain_text, classId: note.class_id, titleIsAuto: note.title_is_auto, drawingJson: undefined as string | undefined, editorMode: (note.editor_mode === "draw" ? "draw" : "type") as "type" | "draw" });
  const [mode, setMode] = useState<"type" | "draw">(draft.current.editorMode);
  const [initialDrawing] = useState(() => normalizeDrawing(note.drawing));
  const aiOpenKey = `studynova-note-ai-open:${note.id}`;
  const [aiOpen, setAiOpenState] = useState(() => { try { return !!initialAction || localStorage.getItem(aiOpenKey) === "1"; } catch { return !!initialAction; } });
  const setAiOpen = (v: boolean | ((o: boolean) => boolean)) => setAiOpenState(o => { const next = typeof v === "function" ? v(o) : v; try { localStorage.setItem(aiOpenKey, next ? "1" : "0"); } catch { /* ignore */ } return next; });
  const [aiDock, setAiDockState] = useState<"side" | "bottom">(() => { try { return localStorage.getItem("studynova-note-ai-dock") === "bottom" ? "bottom" : "side"; } catch { return "side"; } });
  const setAiDock = (d: "side" | "bottom") => { setAiDockState(d); try { localStorage.setItem("studynova-note-ai-dock", d); } catch { /* ignore */ } };
  const [aiBadge, setAiBadge] = useState(0);
  const [quickAction, setQuickAction] = useState<{ id: number; action: "quiz" | "flashcards" | "guide" | "explain" } | null>(() => initialAction ? { id: 1, action: initialAction } : null);
  const [recLabel, setRecLabel] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ key: number; elements: DrawEl[] } | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("syllabusstudy-note-editors");
    ch.onmessage = ev => { const d = ev.data as { type?: string; id?: string; from?: string }; if (d?.type === "ping" && d.id === note.id && d.from !== EDITOR_TAB) ch.postMessage({ type: "pong", id: note.id, from: EDITOR_TAB }); };
    return () => ch.close();
  }, [note.id]);

  const persist = useCallback(async () => {
    if (saving.current || persisted.current === version.current) return;
    saving.current = true; let failed = false;
    setStatus("Saving…"); setError("");
    try {
      while (persisted.current !== version.current) {
        const sentVersion = version.current;
        let result;
        try { result = await save({ data: { id: note.id, ...draft.current, revision: revision.current } }); }
        catch (e) {
          if (!(e instanceof Error && /another window/.test(e.message)) || await otherEditorOpen(note.id)) throw e;
          result = await save({ data: { id: note.id, ...draft.current, revision: revision.current, force: true } });
        }
        revision.current = result.revision;
        persisted.current = sentVersion;
      }
      setDirty(false); setStatus("Saved");
      // Keep the cached copy in sync so reopening the note shows the latest text instantly.
      const d = draft.current;
      qc.setQueryData(["personal-note", note.user_id, note.id], (old: unknown) => old && typeof old === "object" ? { ...(old as object), title: d.title, content: JSON.parse(d.contentJson), plain_text: d.plainText, class_id: d.classId, title_is_auto: d.titleIsAuto, editor_mode: d.editorMode, ...(d.drawingJson ? { drawing: JSON.parse(d.drawingJson) } : {}), revision: revision.current } : old);
      void qc.invalidateQueries({ queryKey: ["personal-notes", note.user_id] });
    } catch (e) { failed = true; setStatus("Not saved"); setError(e instanceof Error ? e.message : "Your changes couldn't be saved."); }
    finally { saving.current = false; if (!timer.current && persisted.current !== version.current && !failed) void persistRef.current(); }
  }, [save, note.id, note.user_id, qc]);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Save right away when leaving the note, switching tabs, or closing the page.
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } void persistRef.current(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); flush(); };
  }, []);

  const changed = useCallback(() => {
    version.current += 1; setDirty(true); setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 350);
  }, [persist]);

  // Pasted or dropped pictures go straight into the note as resizable images.
  function insertFiles(view: import("@tiptap/pm/view").EditorView, files: FileList | undefined | null, drop?: DragEvent) {
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return false;
    const at = drop ? view.posAtCoords({ left: drop.clientX, top: drop.clientY })?.pos : undefined;
    for (const file of imgs) {
      readNoteImage(file).then((src) => {
        const node = view.state.schema.nodes["image"]?.create({ src, alt: file.name });
        if (!node) return;
        const tr = at !== undefined ? view.state.tr.insert(at, node) : view.state.tr.replaceSelectionWith(node);
        view.dispatch(tr);
      }).catch((e: Error) => toast.error(e.message));
    }
    return true;
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [NoteCorrections, NoteLineSpacing, StarterKit.configure({ link: { openOnClick: false, protocols: ["http", "https", "mailto"] } }), TextStyle, FontSize, FontFamily, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), NoteImage, TableKit, TaskList, TaskItem.configure({ nested: true })],
    content: note.content as JSONContent,
    editorProps: {
      attributes: { spellcheck: "true", class: "notes-document", "data-no-voice": "true", "aria-label": "Note document", role: "textbox", "aria-multiline": "true" },
      handlePaste: (view, event) => insertFiles(view, event.clipboardData?.files),
      handleDrop: (view, event) => insertFiles(view, (event as DragEvent).dataTransfer?.files, event as DragEvent),
      handleKeyDown: (view, event) => {
        if (event.key !== "Tab") return false;
        const { state, dispatch } = view;
        event.preventDefault();
        // Inside a list? Tab indents the item, Shift+Tab outdents it.
        const item = [state.schema.nodes["listItem"], state.schema.nodes["taskItem"]].find(
          (t) => {
            let found = false;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => { if (node.type === t) found = true; });
            return found;
          },
        );
        if (item) {
          const move = event.shiftKey ? liftListItem(item) : sinkListItem(item);
          return move(state, dispatch);
        }
        // Plain text: Tab types a tab character instead of jumping around the page.
        if (event.shiftKey) return true;
        dispatch(state.tr.insertText("\t"));
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      draft.current.contentJson = JSON.stringify(current.getJSON());
      draft.current.plainText = current.getText();
      if (draft.current.titleIsAuto) {
        const nextTitle = titleFromNotes(draft.current.plainText);
        draft.current.title = nextTitle;
        setTitle(nextTitle);
      }
      changed();
    },
  });
  // Subscribe to selection/transaction changes so toolbar states stay accurate.
  const state = useEditorState({ editor, selector: ({ editor: current }) => ({ contentSize: current?.state.doc.content.size, selection: current?.state.selection.from, transaction: current?.state }) });
  void state;

  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  useEffect(() => {
    if (blocker.status !== "blocked") return;
    void persist().then(() => { if (persisted.current === version.current) blocker.proceed(); else blocker.reset(); });
  }, [blocker, persist]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <div className={aiDock === "bottom" ? "flex w-full flex-col gap-4 [&>*]:shrink-0" : "flex w-full items-start gap-4"}>
  <div className="mx-auto w-full min-w-0 max-w-5xl">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button asChild variant="ghost" size="icon"><Link to="/notes" search={{}} aria-label="Back to Notes"><ArrowLeft className="size-5" /></Link></Button>
      <Input aria-label="Note title" maxLength={200} className="min-w-0 flex-1 border-transparent bg-transparent font-display text-lg font-bold shadow-none sm:text-xl" value={title} onChange={e => { setTitle(e.target.value); draft.current.title = e.target.value; draft.current.titleIsAuto = false; setAutoTitle(false); changed(); }} />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">{status === "Saving…" ? <Loader2 className="size-3.5 animate-spin" /> : status === "Saved" ? <Check className="size-3.5 text-success" /> : null}{status}</span>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Save to</span>
      <Select value={classId ?? "none"} onValueChange={value => { const next = value === "none" ? null : value; setClassId(next); draft.current.classId = next; changed(); }} disabled={classes.isPending || !!classes.error}>
        <SelectTrigger aria-label="Save note to class" className="w-full sm:w-72"><SelectValue placeholder="Choose class" /></SelectTrigger>
        <SelectContent><SelectItem value="none">No class</SelectItem>{classes.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.course_code ? `${c.course_code} — ` : ""}{c.class_name}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant={autoTitle ? "secondary" : "outline"} size="sm" aria-pressed={autoTitle} onClick={() => { const next = !autoTitle; setAutoTitle(next); draft.current.titleIsAuto = next; if (next) { draft.current.title = titleFromNotes(draft.current.plainText); setTitle(draft.current.title); } changed(); }}>Auto title{autoTitle ? " on" : " off"}</Button>
      {classes.error && <span className="text-sm text-destructive" role="alert">Classes couldn't be loaded.</span>}
    </div>
    {error && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3" role="alert"><p className="min-w-0 flex-1 text-sm">{error}</p><Button variant="outline" size="sm" onClick={() => void persist()}><RotateCw className="size-4" />Try again</Button></div>}
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Note mode">
        {([["type", "Type", Keyboard], ["draw", "Draw", PenTool]] as const).map(([id, label, Icon]) => <Button key={id} role="tab" aria-selected={mode === id} size="sm" variant={mode === id ? "default" : "ghost"} onClick={() => { setMode(id); draft.current.editorMode = id; changed(); }}><Icon className="size-4" />{label}</Button>)}
      </div>
      <Button variant={aiOpen ? "secondary" : "outline"} size="sm" onClick={() => setAiOpen(o => !o)} aria-pressed={aiOpen}><Sparkles className="size-4 text-primary" />AI Assistant{aiBadge > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{aiBadge}</span>}</Button>
      <ShareButton kind="note" refId={note.id} title={title} payload={() => ({ content: (editor?.getJSON() ?? note.content) as Json, plainText: editor?.getText() ?? note.plain_text }) as Json} />
      {recLabel && <button type="button" onClick={() => setAiOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive" role="status"><span className="size-2 animate-pulse rounded-full bg-destructive" />{recLabel}</button>}
      {([
        ["quiz", "Quiz me", HelpCircle],
        ["flashcards", "Flashcards", BookOpen],
        ["guide", "Study guide", Brain],
        ["explain", "Explain notes", Lightbulb],
      ] as const).map(([action, label, Icon]) => <Button key={action} size="sm" variant="outline" onClick={() => { setQuickAction({ id: Date.now(), action }); setAiOpen(true); }}><Icon className="size-4" />{label}</Button>)}
    </div>
    <div className={mode === "draw" ? "note-paper rounded-xl border border-border shadow-card" : "hidden"}>
      <NoteDrawingCanvas value={initialDrawing} incoming={incoming} onChange={(d: Drawing) => { draft.current.drawingJson = JSON.stringify(d); changed(); }} />
    </div>
    <div className={mode === "type" ? "note-paper overflow-clip rounded-xl border border-border shadow-card" : "hidden"}>
      {editor && <div className="sticky top-[calc(7rem+env(safe-area-inset-top))] z-20 bg-card shadow-card"><NotesToolbar editor={editor} /></div>}
      {editor ? <NoteImageMenu editor={editor} /> : null}
      <EditorContent editor={editor} className="notes-editor min-h-[60dvh] overflow-x-auto bg-transparent" />
      <div className="border-t border-border px-5 py-2 text-right text-xs text-muted-foreground">{editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0} words</div>
    </div>
  </div>
  <NotesAiPanel open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} editor={editor} title={title} classId={classId} quickAction={quickAction} onRecordingChange={setRecLabel} onBadge={setAiBadge} dock={aiDock} onToggleDock={() => setAiDock(aiDock === "bottom" ? "side" : "bottom")} onAddDiagram={els => { setIncoming({ key: Date.now(), elements: els }); setMode("draw"); draft.current.editorMode = "draw"; }} />
  </div>;
}
