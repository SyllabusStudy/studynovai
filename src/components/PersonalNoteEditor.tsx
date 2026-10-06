import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, RotateCw } from "lucide-react";
import { savePersonalNote } from "@/lib/notes.functions";
import { NotesToolbar } from "@/components/NotesToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Database } from "@/integrations/supabase/types";

type Note = Database["public"]["Tables"]["personal_notes"]["Row"];

export function PersonalNoteEditor({ note }: { note: Note }) {
  const save = useServerFn(savePersonalNote);
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const revision = useRef(note.revision);
  const version = useRef(0);
  const persisted = useRef(0);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useRef({ title: note.title, contentJson: JSON.stringify(note.content), plainText: note.plain_text });

  const persist = useCallback(async () => {
    if (saving.current || persisted.current === version.current) return;
    saving.current = true;
    setStatus("Saving…"); setError("");
    try {
      while (persisted.current !== version.current) {
        const sentVersion = version.current;
        const result = await save({ data: { id: note.id, ...draft.current, revision: revision.current } });
        revision.current = result.revision;
        persisted.current = sentVersion;
      }
      setDirty(false); setStatus("Saved");
      void qc.invalidateQueries({ queryKey: ["personal-notes", note.user_id] });
    } catch (e) { setStatus("Not saved"); setError(e instanceof Error ? e.message : "Your changes couldn't be saved."); }
    finally { saving.current = false; }
  }, [save, note.id, note.user_id, qc]);

  const changed = useCallback(() => {
    version.current += 1; setDirty(true); setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 900);
  }, [persist]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, protocols: ["http", "https", "mailto"] } }), TextStyle, FontSize, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), Image.configure({ allowBase64: true }), TableKit, TaskList, TaskItem.configure({ nested: true })],
    content: note.content as JSONContent,
    editorProps: { attributes: { class: "notes-document", "aria-label": "Note document", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: current }) => {
      draft.current.contentJson = JSON.stringify(current.getJSON());
      draft.current.plainText = current.getText();
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

  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button asChild variant="ghost" size="icon"><Link to="/notes" search={{}} aria-label="Back to Notes"><ArrowLeft className="size-5" /></Link></Button>
      <Input aria-label="Note title" maxLength={200} className="min-w-0 flex-1 border-transparent bg-transparent font-display text-lg font-bold shadow-none sm:text-xl" value={title} onChange={e => { setTitle(e.target.value); draft.current.title = e.target.value; changed(); }} />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">{status === "Saving…" ? <Loader2 className="size-3.5 animate-spin" /> : status === "Saved" ? <Check className="size-3.5 text-success" /> : null}{status}</span>
    </div>
    {error && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3" role="alert"><p className="min-w-0 flex-1 text-sm">{error}</p><Button variant="outline" size="sm" onClick={() => void persist()}><RotateCw className="size-4" />Try again</Button></div>}
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {editor && <NotesToolbar editor={editor} />}
      <EditorContent editor={editor} className="notes-editor min-h-[60dvh] overflow-x-auto bg-background/50" />
      <div className="border-t border-border px-5 py-2 text-right text-xs text-muted-foreground">{editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0} words</div>
    </div>
  </div>;
}