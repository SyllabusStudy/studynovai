import { bestTopicBlock } from "@/lib/note-insert";
import { setMicBusy } from "@/lib/mic-busy";
import { NoteCorrectionPopover } from "@/components/NoteCorrectionPopover";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, Brain, Check, Copy, ExternalLink, HelpCircle, Lightbulb, Loader2, Maximize2, Mic, Minimize2, Network, PanelBottom, PanelRight, Pause, Play, Plus, Search, Send, Sparkles, Square, SpellCheck, Wand2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceTypeButton } from "@/components/VoiceTypeButton";
import { correctionKind, findCorrectionRanges, noteCorrectionsKey, dropRejected, rejectKey } from "@/lib/note-corrections";
import { cn } from "@/lib/utils";
import { runNotesAi, saveNoteFlashcards, type NotesAiAction, type NotesAiResult, type NotesAiSuggestion } from "@/lib/notes-ai.functions";
import { createLectureNotes, transcribeLecturePiece } from "@/lib/lecture.functions";
import { markdownToHtml, transcribeRecording } from "@/lib/notes-lecture";
import { diagramToElements, type DrawEl } from "@/lib/note-drawing";
import { supabase } from "@/integrations/supabase/client";

type Tab = "ask" | "research" | "explain" | "writing" | "study" | "lecture";
const TABS: { id: Tab; label: string; Icon: typeof Sparkles }[] = [
  { id: "ask", label: "Ask AI", Icon: Sparkles }, { id: "research", label: "Research", Icon: Search }, { id: "explain", label: "Explain", Icon: Lightbulb },
  { id: "writing", label: "Writing", Icon: Wand2 }, { id: "study", label: "Study", Icon: Brain }, { id: "lecture", label: "Lecture", Icon: Mic },
];
type Msg = { role: "user" | "assistant"; content: string; sources?: NotesAiResult["sources"] | undefined };
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function AiOutput({ text, onInsert, onBottom, sources }: { text: string; onInsert: () => void; onBottom?: (() => void) | undefined; sources?: NotesAiResult["sources"] | undefined }) {
  return <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
    <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary"><Sparkles className="size-3" />AI — not part of your notes</div>
    <div className="notes-ai-output prose-sm max-w-none [&_h1]:text-base [&_h2]:text-sm [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />
    {!!sources?.length && <div className="mt-3 border-t border-border pt-2"><p className="mb-1 text-xs font-semibold text-muted-foreground">Sources</p>
      <ul className="space-y-1">{sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-xs text-primary hover:underline"><ExternalLink className="mt-0.5 size-3 shrink-0" />{s.title}</a></li>)}</ul></div>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={onInsert}><Plus className="size-4" />{onBottom ? "Insert under topic" : "Insert into Notes"}</Button>
      {onBottom && <Button size="sm" variant="outline" onClick={onBottom}>Add to bottom</Button>}
      <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="size-4" />Copy</Button>
    </div>
  </div>;
}

export function NotesAiPanel({ noteId, open, onOpen, onClose, editor, title, classId, quickAction, onAddDiagram, onRecordingChange, onBadge, dock, onToggleDock }: {
  open: boolean; onOpen: () => void; onClose: () => void; editor: Editor | null; title: string; classId: string | null;
  quickAction?: { id: number; action: "quiz" | "flashcards" | "guide" | "explain" } | null;
  onAddDiagram: (els: DrawEl[]) => void; onRecordingChange: (label: string | null) => void; onBadge: (count: number) => void;
  dock: "side" | "bottom"; onToggleDock: () => void; noteId?: string | undefined;
}) {
  const ai = useServerFn(runNotesAi);
  const saveCards = useServerFn(saveNoteFlashcards);
  const transcribe = useServerFn(transcribeLecturePiece);
  const makeLecture = useServerFn(createLectureNotes);
  const [tab, setTab] = useState<Tab>("ask");
  const [busy, setBusy] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [research, setResearch] = useState<Msg[]>([]);
  const [explain, setExplain] = useState("");
  const [writeMode, setWriteMode] = useState("better wording");
  const [suggestions, setSuggestions] = useState<(NotesAiSuggestion & { state?: "accepted" | "rejected" })[]>([]);
  const [selectedCorrection, setSelectedCorrection] = useState<number | null>(null);
  const [correctionAnchor, setCorrectionAnchor] = useState<HTMLElement | null>(null);
  const clickedRange = useRef<{ index: number; from: number; to: number } | null>(null);
  const [study, setStudy] = useState<NotesAiResult | null>(null);
  const [quizPick, setQuizPick] = useState<Record<number, number>>({});

  const noteText = () => editor?.getText() ?? "";
  // ---- Always-on helpers (on by default, each can be switched off; choice remembered on this device) ----
  const [autoSpell, setAutoSpell] = useState(true);
  const rejectStore = `studynova-note-rejected:${noteId ?? "draft"}`;
  const rejected = useRef<Set<string>>(new Set());
  useEffect(() => { try { rejected.current = new Set(JSON.parse(localStorage.getItem(rejectStore) ?? "[]") as string[]); } catch { rejected.current = new Set(); } }, [rejectStore]);
  const rememberReject = (original: string) => { rejected.current.add(rejectKey(original)); try { localStorage.setItem(rejectStore, JSON.stringify([...rejected.current].slice(-500))); } catch { /* ignore */ } };
  const [autoFeedback, setAutoFeedback] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [feedbackNew, setFeedbackNew] = useState(false);
  useEffect(() => {
    // v2: auto checking is always ON by default; older saved "off" values (often set by errors, not the student) are ignored.
    try { const v = JSON.parse(localStorage.getItem("studynova-notes-ai-auto-v2") ?? "{}"); if (v.spell === false) setAutoSpell(false); if (v.feedback === false) setAutoFeedback(false); } catch { /* ignore */ }
  }, []);
  const saveAuto = (spell: boolean, fb: boolean) => localStorage.setItem("studynova-notes-ai-auto-v2", JSON.stringify({ spell, feedback: fb }));
  const autoState = useRef({ checkedParas: new Set<string>(), fbText: "", spellBusy: false, fbBusy: false, lastFb: 0 });
  const primedFor = useRef<unknown>(null);
  const asking = useRef(false);
  useEffect(() => {
    if (!editor) return;
    let spellTimer: ReturnType<typeof setTimeout> | undefined, fbTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    // Errors never switch auto checking off — only the student's checkbox does. A busy AI
    // retries shortly; a missing key or used-up limit just pauses for a minute.
    let pausedUntil = 0;
    const quiet = (e: unknown) => {
      const blocked = e instanceof Error && /free limit|API key|AI key/i.test(e.message);
      pausedUntil = Date.now() + (blocked ? 60_000 : 4_000);
      if (!disposed) { clearTimeout(spellTimer); spellTimer = setTimeout(() => void runSpell(), blocked ? 60_000 : 4_000); }
    };
    // Only new or edited paragraphs are sent, in small batches, so checks come back fast
    // even on long notes. Results are kept while the student keeps typing.
    // The paragraph being typed is checked first; when a note opens, only its last few
    // paragraphs are auto-checked (the Spelling & grammar button still checks everything).
    const runSpell = async () => {
      const st = autoState.current;
      // A student question always goes first; background checks wait until it's answered.
      if (asking.current) { clearTimeout(spellTimer); spellTimer = setTimeout(() => void runSpell(), 1500); return; }
      if (st.spellBusy || Date.now() < pausedUntil - 50) return;
      const paras = [...new Set(editor.getText().split(/\n+/).map(p => p.trim()).filter(p => p.length >= 4))];
      if (primedFor.current !== editor) { primedFor.current = editor; paras.slice(0, -4).forEach(p => st.checkedParas.add(p)); }
      const here = editor.state.selection.$from.parent.textContent.trim();
      const order = [...(here && paras.includes(here) ? [here] : []), ...paras.slice().reverse().filter(p => p !== here)];
      const pending: string[] = []; let size = 0;
      for (const p of order) {
        if (st.checkedParas.has(p)) continue;
        if (pending.length && size + p.length > 1200) break;
        pending.push(p); size += p.length;
      }
      if (!pending.length || size < 8) return;
      st.spellBusy = true; let ok = false;
      try {
        const r = await ai({ data: { action: "spelling", noteText: pending.join("\n\n").slice(0, 6000), selection: "", question: "", writeMode: "", history: [] } });
        if (disposed || editor.isDestroyed) return;
        if (r.error) { quiet(new Error(r.error)); return; }
        ok = true;
        pending.forEach(p => st.checkedParas.add(p));
        const current = editor.getText();
        const fresh = dropRejected(r.suggestions, rejected.current).filter(s => current.includes(s.original));
        setSuggestions(prev => {
          const kept = prev.filter(s => s.state || current.includes(s.original));
          const seen = new Set(kept.filter(s => !s.state).map(s => s.original));
          return [...kept, ...fresh.filter(s => !seen.has(s.original))];
        });
      } catch (e) { quiet(e); } finally {
        st.spellBusy = false;
        // More unchecked paragraphs (or edits made while waiting)? Check them right away.
        if (ok && !disposed && !editor.isDestroyed) { clearTimeout(spellTimer); spellTimer = setTimeout(() => void runSpell(), 400); }
      }
    };
    const runFeedback = async () => {
      if (asking.current) { clearTimeout(fbTimer); fbTimer = setTimeout(() => void runFeedback(), 5000); return; }
      const text = editor.getText(); const st = autoState.current;
      // Only when enough new writing has happened, and at most about once a minute.
      if (st.fbBusy || text.trim().length < 120 || Math.abs(text.length - st.fbText.length) < 100 || Date.now() - st.lastFb < 60_000) return;
      st.fbBusy = true; st.fbText = text; st.lastFb = Date.now();
      try {
        const r = await ai({ data: { action: "feedback", noteText: text, selection: "", question: "", writeMode: "", history: [] } });
        if (r.error) { quiet(new Error(r.error)); return; }
        if (r.text && !/^\[none\]$/i.test(r.text.trim())) { setFeedback(r.text); setFeedbackNew(true); }
      } catch (e) { quiet(e); } finally { st.fbBusy = false; }
    };
    const onUpdate = () => {
      if (autoSpell) { clearTimeout(spellTimer); spellTimer = setTimeout(() => void runSpell(), 700); }
      if (autoFeedback) { clearTimeout(fbTimer); fbTimer = setTimeout(() => void runFeedback(), 8000); }
    };
    editor.on("update", onUpdate);
    if (autoSpell) spellTimer = setTimeout(() => void runSpell(), 500);
    if (autoFeedback) fbTimer = setTimeout(() => void runFeedback(), 4000);
    return () => { disposed = true; editor.off("update", onUpdate); clearTimeout(spellTimer); clearTimeout(fbTimer); };
  }, [editor, autoSpell, autoFeedback, ai]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(noteCorrectionsKey, autoSpell ? suggestions : []));
  }, [editor, suggestions, autoSpell]);
  useEffect(() => {
    if (!editor) return;
    const choose = (event: Event) => {
      const { index, from, to, anchor } = (event as CustomEvent<{ index: number; from: number; to: number; anchor: HTMLElement }>).detail;
      const s = suggestions[index];
      if (!s || s.state) return;
      clickedRange.current = { index, from, to };
      setSelectedCorrection(index); setCorrectionAnchor(anchor);
    };
    editor.view.dom.addEventListener("note-correction-select", choose);
    return () => editor.view.dom.removeEventListener("note-correction-select", choose);
  }, [editor, suggestions]);
  useEffect(() => {
    if (!editor) return;
    const close = () => { setSelectedCorrection(null); setCorrectionAnchor(null); clickedRange.current = null; };
    editor.on("update", close);
    return () => { editor.off("update", close); };
  }, [editor]);
  useEffect(() => { setSelectedCorrection(null); setCorrectionAnchor(null); clickedRange.current = null; }, [suggestions, autoSpell]);
  const selection = () => { if (!editor) return ""; const { from, to } = editor.state.selection; return from === to ? "" : editor.state.doc.textBetween(from, to, "\n"); };
  const insert = (md: string, label = "From AI Assistant", topic?: string) => {
    if (!editor) return;
    const html = `<p><em>✨ ${label}</em></p>${markdownToHtml(md)}`;
    if (topic) {
      const ends: number[] = []; const texts: string[] = [];
      editor.state.doc.forEach((node, offset) => { texts.push(node.textContent); ends.push(offset + node.nodeSize); });
      const i = bestTopicBlock(texts, topic);
      const end = ends[i];
      if (i >= 0 && end !== undefined) { editor.chain().focus().insertContentAt(end, html).run(); toast.success("Added under the matching topic"); return; }
    }
    editor.chain().focus("end").insertContent(html).run();
    toast.success(topic ? "Topic not found — added to the bottom" : "Added to your note");
  };

  const call = async (action: NotesAiAction, extra: { question?: string; history?: Msg[]; noteText?: string | undefined } = {}) => {
    setBusy(action); asking.current = true;
    try {
      const r = await ai({ data: { action, noteText: extra.noteText ?? noteText(), selection: selection(), question: extra.question ?? "", writeMode, history: (extra.history ?? []).slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 60000) })) } });
      if (r.error) { toast.error(r.error); return null; }
      return r;
    } catch (e) { toast.error(e instanceof Error ? e.message : "The AI couldn't answer right now."); return null; }
    finally { setBusy(null); asking.current = false; }
  };

  const send = async () => {
    const q = input.trim(); if (!q) return;
    setInput("");
    if (tab === "research") {
      const next = [...research, { role: "user" as const, content: q }]; setResearch(next);
      const r = await call("research", { question: q, history: research.map(({ role, content }) => ({ role, content })) });
      if (r) setResearch([...next, { role: "assistant", content: r.text, sources: r.sources }]);
    } else {
      const next = [...chat, { role: "user" as const, content: q }]; setChat(next);
      const r = await call("ask", { question: q, history: chat });
      if (r) setChat([...next, { role: "assistant", content: r.text, sources: r.sources }]);
    }
  };

  const replaceInDoc = (s: NotesAiSuggestion) => {
    if (!editor) return false;
    const clicked = clickedRange.current;
    const validClicked = clicked && suggestions[clicked.index] === s && editor.state.doc.textBetween(clicked.from, clicked.to, "", "\ufffc") === s.original;
    const range = validClicked ? clicked : findCorrectionRanges(editor.state.doc, s.original)[0];
    if (!range) return false;
    editor.commands.command(({ tr }) => {
      const marks = tr.doc.nodeAt(range.from)?.marks ?? tr.doc.resolve(range.from).marks();
      tr.replaceWith(range.from, range.to, s.suggestion ? editor.schema.text(s.suggestion, marks) : []);
      return true;
    });
    clickedRange.current = null;
    return true;
  };

  const acceptAll = () => {
    if (!editor) return;
    const accepted = new Set<number>();
    editor.commands.command(({ tr }) => {
      suggestions.forEach((s, index) => {
        if (s.state || !s.original || s.original === s.suggestion) return;
        const ranges = findCorrectionRanges(tr.doc, s.original);
        ranges.reverse().forEach(({ from, to }) => {
          const marks = tr.doc.nodeAt(from)?.marks ?? tr.doc.resolve(from).marks();
          tr.replaceWith(from, to, s.suggestion ? editor.schema.text(s.suggestion, marks) : []);
          accepted.add(index);
        });
      });
      return true;
    });
    setSuggestions(current => current.map((s, index) => accepted.has(index) ? { ...s, state: "accepted" } : s));
    const skipped = suggestions.filter(s => !s.state).length - accepted.size;
    if (accepted.size) toast.success(`${accepted.size} suggestion${accepted.size === 1 ? "" : "s"} accepted`);
    if (skipped) toast.message(`${skipped} suggestion${skipped === 1 ? " needs" : "s need"} review because the text changed.`);
  };

  // ---- Lecture recording ----
  const [rec, setRec] = useState<"idle" | "recording" | "paused">("idle");
  const [secs, setSecs] = useState(0);
  const [recording, setRecording] = useState<{ blob: Blob; url: string } | null>(null);
  const [stage, setStage] = useState("");
  const [lecture, setLecture] = useState<{ id: string; title: string; summary: string; key_concepts: string[]; transcript: string; cards: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (rec !== "recording") return;
    const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t);
  }, [rec]);
  useEffect(() => { onRecordingChange(rec === "idle" ? null : `${rec === "paused" ? "Paused" : "Recording"} ${fmt(secs)}`); }, [rec, secs, onRecordingChange]);
  useEffect(() => { setMicBusy("note-lecture", rec !== "idle"); }, [rec]);
  useEffect(() => () => { setMicBusy("note-lecture", false); stream.current?.getTracks().forEach(t => t.stop()); }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("This browser can't record audio. Try Chrome, Edge or Safari."); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      stream.current = s; chunks.current = [];
      const mr = new MediaRecorder(s);
      mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        setRecording(r => { if (r) URL.revokeObjectURL(r.url); return { blob, url: URL.createObjectURL(blob) }; });
        s.getTracks().forEach(t => t.stop());
      };
      mr.start(1000); recorder.current = mr; setSecs(0); setRec("recording"); setLecture(null);
    } catch (e) {
      const denied = e instanceof DOMException && /NotAllowed|Security/.test(e.name);
      toast.error(denied ? "Microphone access was blocked. Allow the microphone in your browser's site settings, then try again." : "No microphone was found. Plug one in or check your device settings.");
    }
  };
  const pause = () => { recorder.current?.pause(); setRec("paused"); };
  const resume = () => { recorder.current?.resume(); setRec("recording"); };
  const stop = () => { recorder.current?.stop(); recorder.current = null; setRec("idle"); };

  const processLecture = async () => {
    if (!recording) return;
    setBusy("lecture");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const transcript = await transcribeRecording(auth.user.id, recording.blob, transcribe, setStage);
      setStage("Organizing your lecture with your notes…");
      const r = await makeLecture({ data: { transcript, fileName: title || "Lecture", classId, contextNotes: noteText().slice(0, 60000) } });
      const { data: row } = await supabase.from("lecture_notes").select("id,title,summary,key_concepts,transcript").eq("id", r.id).maybeSingle();
      if (row) setLecture({ ...row, summary: row.summary ?? "", key_concepts: Array.isArray(row.key_concepts) ? row.key_concepts.map(String) : [], transcript: row.transcript ?? "", cards: r.cards });
      toast.success(`Lecture processed${r.cards ? ` — ${r.cards} flashcards saved` : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The lecture couldn't be processed. Your recording is kept — try again."); }
    finally { setBusy(null); setStage(""); }
  };

  const runStudy = async (action: "flashcards" | "quiz" | "guide" | "diagram", source?: string) => {
    const r = await call(action, { noteText: source, question: action === "diagram" ? input.trim() : "" });
    if (!r) return;
    if (action === "diagram" && r.diagram) { onAddDiagram(diagramToElements(r.diagram)); toast.success("Diagram added on a new drawing page — switch to Draw to edit it"); return; }
    setQuizPick({}); setStudy({ ...r, text: action === "guide" ? r.text : "" });
  };

  const handledQuickAction = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !quickAction || handledQuickAction.current === quickAction.id) return;
    handledQuickAction.current = quickAction.id;
    if (quickAction.action === "explain") {
      setTab("explain");
      void call("explain").then(r => { if (r) setExplain(r.text); });
      return;
    }
    setTab("study");
    void runStudy(quickAction.action);
  }, [open, quickAction]);

  const openSpell = suggestions.filter(x => !x.state).length;
  useEffect(() => { onBadge(openSpell + (feedbackNew ? 1 : 0)); }, [openSpell, feedbackNew, onBadge]);
  useEffect(() => { if (open && tab === "ask") setFeedbackNew(false); }, [open, tab, feedback]);
  const thread = tab === "research" ? research : chat;
  const working = !!busy;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { user: me } = useAuth();
  const meta = (me?.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = String(meta["full_name"] ?? meta["name"] ?? me?.email?.split("@")[0] ?? "there").trim().split(/\s+/)[0] || "there";
  const [wide, setWide] = useState(false);
  useEffect(() => { try { setWide(localStorage.getItem("studynova-notes-ai-wide") === "1"); } catch { /* ignore */ } }, []);
  const toggleWide = () => setWide(w => { try { localStorage.setItem("studynova-notes-ai-wide", w ? "0" : "1"); } catch { /* ignore */ } return !w; });
  // New messages stay visible, but changing tools starts at their controls.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && (tab === "ask" || tab === "research")) el.scrollTop = el.scrollHeight;
  }, [thread.length, busy]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tab]);

  const dockClasses = dock === "bottom"
    ? "lg:relative lg:inset-auto lg:z-10 lg:shrink-0 lg:w-full lg:max-w-5xl lg:max-h-none lg:bg-background lg:transition-[height]"
    : "lg:sticky lg:top-[calc(7rem+env(safe-area-inset-top))] lg:z-40 lg:max-h-[calc(100dvh-8rem-env(safe-area-inset-top))] lg:shrink-0 lg:transition-[width]";
  const sizeClasses = dock === "bottom"
    ? (wide ? "lg:h-[calc(100dvh-13rem)]" : "lg:h-[min(58dvh,620px)]")
    : (wide ? "lg:w-[min(50vw,760px)]" : "lg:w-[380px]");
  const closeCorrection = () => { setSelectedCorrection(null); setCorrectionAnchor(null); clickedRange.current = null; };
  const currentCorrection = selectedCorrection === null ? undefined : suggestions[selectedCorrection];
  return <>
    <NoteCorrectionPopover suggestion={currentCorrection?.state ? undefined : currentCorrection} anchor={correctionAnchor} onClose={closeCorrection} onAccept={() => {
      if (!currentCorrection || selectedCorrection === null) return;
      const index = selectedCorrection;
      if (replaceInDoc(currentCorrection)) setSuggestions(list => list.map((s, i) => i === index ? { ...s, state: "accepted" } : s));
      else toast.error("That text has changed. Please check it again.");
      closeCorrection();
    }} onReject={() => {
      if (!currentCorrection) return;
      rememberReject(currentCorrection.original);
      setSuggestions(list => list.filter(s => rejectKey(s.original) !== rejectKey(currentCorrection.original)));
      closeCorrection();
    }} />
    <aside aria-label="AI Assistant" className={cn(open ? "flex" : "hidden", "fixed inset-0 z-50 min-h-0 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-card", dockClasses, sizeClasses)}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display font-bold"><Sparkles className="size-4 text-primary" />AI Assistant</p>
        <p className="truncate text-xs text-muted-foreground">Hey {firstName} 👋 I'm reading along — ask me anything!</p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button size="icon" variant="ghost" className="hidden lg:inline-flex" aria-label={dock === "bottom" ? "Move AI Assistant beside the note" : "Move AI Assistant below the note"} title={dock === "bottom" ? "Move beside the note" : "Move below the note"} onClick={onToggleDock}>{dock === "bottom" ? <PanelRight className="size-4" /> : <PanelBottom className="size-4" />}</Button>
        <Button size="icon" variant="ghost" className="hidden lg:inline-flex" aria-label={wide ? "Make AI Assistant smaller" : "Make AI Assistant bigger"} title={wide ? "Smaller panel" : "Bigger panel"} onClick={toggleWide}>{wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
        <Button size="icon" variant="ghost" aria-label="Close AI Assistant" onClick={onClose}><X className="size-5" /></Button>
      </div>
    </div>
    <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-3" aria-label="Quick AI tools">
      <Button size="sm" variant="secondary" onClick={() => { setTab("study"); if (!working) void runStudy("quiz"); }}><HelpCircle className="size-4" />Quiz me</Button>
      <Button size="sm" variant="outline" onClick={() => { setTab("study"); if (!working) void runStudy("flashcards"); }}><BookOpen className="size-4" />Make flashcards</Button>
      <Button size="sm" variant="outline" onClick={() => { setTab("study"); if (!working) void runStudy("guide"); }}><Brain className="size-4" />Study guide</Button>
      <Button size="sm" variant="outline" onClick={async () => { setTab("explain"); if (working) return; const r = await call("explain"); if (r) setExplain(r.text); }}><Lightbulb className="size-4" />Explain notes</Button>
    </div>
    <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border px-2 py-2" role="tablist" aria-label="AI Assistant tools">
      {TABS.map(t => <Button key={t.id} role="tab" aria-selected={tab === t.id} size="sm" variant={tab === t.id ? "default" : "ghost"} onClick={() => setTab(t.id)} className="min-w-0 px-2"><t.Icon className="size-4 shrink-0" />{t.label}{t.id === "lecture" && rec !== "idle" && <span className="size-2 animate-pulse rounded-full bg-destructive" />}</Button>)}
    </div>
    <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs">
      <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={autoSpell} onChange={e => { setAutoSpell(e.target.checked); saveAuto(e.target.checked, autoFeedback); }} />Auto spelling & wording</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={autoFeedback} onChange={e => { setAutoFeedback(e.target.checked); saveAuto(autoSpell, e.target.checked); }} />Auto feedback on my notes</label>
    </div>
    <div ref={scrollRef} className="min-h-0 shrink space-y-3 overflow-y-auto p-4">
      {tab === "ask" && autoFeedback && feedback && <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Feedback on your notes (updates as you write)</p><AiOutput text={feedback} onInsert={() => insert(feedback, "AI feedback")} /></div>}
      {(tab === "ask" || tab === "research") && <>
        <p className="text-xs text-muted-foreground">{tab === "ask" ? "Ask anything while you take notes. Answers stay here until you choose to add them." : "Look up outside information with sources. It stays separate from your notes."}</p>
        {!thread.length && <div className="flex flex-wrap gap-2">{(tab === "ask" ? ["Explain this in simple terms", "Can you give me an example?", "What should I know for the exam?"] : ["Latest research on this topic", "History and key people", "Real-world applications"]).map(q => <Button key={q} size="sm" variant="outline" onClick={() => setInput(q)}>{q}</Button>)}</div>}
        {thread.map((m, i) => m.role === "user" ? <div key={i} className="ml-8 rounded-lg bg-secondary px-3 py-2 text-sm">{m.content}</div> : <AiOutput key={i} text={m.content} sources={m.sources} onInsert={() => insert(m.content, tab === "research" ? "Research (outside sources)" : "From AI Assistant", thread.slice(0, i).filter(x => x.role === "user").map(x => x.content).join(" ") || m.content.slice(0, 200))} onBottom={() => insert(m.content, tab === "research" ? "Research (outside sources)" : "From AI Assistant")} />)}
      </>}
      {tab === "explain" && <>
        <p className="text-xs text-muted-foreground">Highlight part of your note, then tap Explain. With nothing selected, it explains the main idea.</p>
        <Button onClick={async () => { const r = await call("explain", { question: input.trim() }); if (r) setExplain(r.text); }} disabled={working}><Lightbulb className="size-4" />Explain</Button>
        {explain && <AiOutput text={explain} onInsert={() => insert(explain, "Explanation from AI")} />}
      </>}
      {tab === "writing" && <>
        <p className="text-xs text-muted-foreground">Spelling and grammar are checked automatically as you write. Nothing in your note changes until you tap Accept. Select text and use the buttons to improve just that part.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={working} onClick={async () => { const r = await call("spelling"); if (r) { const list = dropRejected(r.suggestions, rejected.current); setSuggestions(list); if (!list.length) toast.success("No spelling or grammar mistakes found"); } }}><SpellCheck className="size-4" />Spelling & grammar</Button>
          {["better wording", "make clearer", "make shorter", "expand", "rewrite", "academic tone"].map(m => <Button key={m} size="sm" variant={writeMode === m ? "secondary" : "outline"} disabled={working} onClick={async () => { setWriteMode(m); setBusy("improve"); try { const r = await ai({ data: { action: "improve", noteText: noteText(), selection: selection(), question: "", writeMode: m, history: [] } }); if (r.error) toast.error(r.error); else { setSuggestions(r.suggestions); if (!r.suggestions.length) toast.message("No changes suggested"); } } finally { setBusy(null); } }} className="capitalize">{m}</Button>)}
        </div>
        {openSpell > 0 && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{openSpell} suggestion{openSpell === 1 ? "" : "s"}</span><Button size="sm" disabled={working || !editor} onClick={acceptAll}><Check className="size-4" />Accept All</Button></div>}
      </>}
      {tab === "study" && <>
        <p className="text-xs text-muted-foreground">Make study tools from this note (or your selected part).</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={working} onClick={() => void runStudy("flashcards")}><BookOpen className="size-4" />Flashcards</Button>
          <Button variant="outline" disabled={working} onClick={() => void runStudy("quiz")}><HelpCircle className="size-4" />Quiz</Button>
          <Button variant="outline" disabled={working} onClick={() => void runStudy("guide")}><Brain className="size-4" />Study guide</Button>
          <Button variant="outline" disabled={working} onClick={() => void runStudy("diagram")}><Network className="size-4" />Create diagram</Button>
        </div>
        {study?.text && <AiOutput text={study.text} onInsert={() => insert(study.text, "Study guide from AI")} />}
        {!!study?.cards.length && <div className="space-y-2">
          {study.cards.map((c, i) => <div key={i} className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">{c.front}</p><p className="mt-1 text-muted-foreground">{c.back}</p></div>)}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={async () => { try { const r = await saveCards({ data: { deck: `Notes: ${title}`.slice(0, 200), classId, cards: study.cards } }); toast.success(`${r.count} flashcards saved to your Flashcards`); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); } }}><Check className="size-4" />Save to Flashcards</Button>
            <Button size="sm" variant="secondary" onClick={() => insert(study.cards.map(c => `- **${c.front}** — ${c.back}`).join("\n"), "Flashcards from AI")}><Plus className="size-4" />Insert into Notes</Button>
          </div>
        </div>}
        {!!study?.quiz.length && <div className="space-y-3">{study.quiz.map((q, i) => <div key={i} className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{i + 1}. {q.question}</p>
          <div className="mt-2 space-y-1">{q.choices.map((c, j) => { const picked = quizPick[i]; const show = picked !== undefined; return <button key={j} type="button" disabled={show} onClick={() => setQuizPick(p => ({ ...p, [i]: j }))} className={cn("block w-full rounded-md border px-2 py-1.5 text-left", show && j === q.answer ? "border-success bg-success/10" : show && j === picked ? "border-destructive bg-destructive/10" : "border-border hover:bg-accent")}>{c}</button>; })}</div>
          {quizPick[i] !== undefined && <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>}
        </div>)}</div>}
      </>}
      {tab === "lecture" && <>
        <p className="text-xs text-muted-foreground">Record while you keep typing or drawing. When you stop, tap Process Lecture — your own notes are used as extra context and never overwritten.</p>
        <div className="rounded-xl border border-border p-4 text-center">
          <p className={cn("font-display text-3xl font-bold tabular-nums", rec === "recording" && "text-destructive")}>{fmt(secs)}</p>
          <p className="mb-3 text-xs text-muted-foreground" role="status">{rec === "recording" ? "● Recording" : rec === "paused" ? "Paused" : recording ? "Recording ready" : "Not recording"}</p>
          <div className="flex justify-center gap-2">
            {rec === "idle" && <Button onClick={() => void start()} disabled={working}><Mic className="size-4" />{recording ? "Record again" : "Record Lecture"}</Button>}
            {rec === "recording" && <Button variant="secondary" onClick={pause}><Pause className="size-4" />Pause</Button>}
            {rec === "paused" && <Button variant="secondary" onClick={resume}><Play className="size-4" />Resume</Button>}
            {rec !== "idle" && <Button variant="destructive" onClick={stop}><Square className="size-4" />Stop</Button>}
          </div>
        </div>
        {recording && rec === "idle" && <div className="space-y-2">
          <audio controls src={recording.url} className="w-full" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void processLecture()} disabled={working}>{busy === "lecture" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Process Lecture</Button>
            <Button variant="outline" asChild><a href={recording.url} download={`${title || "lecture"}.webm`}>Save audio</a></Button>
          </div>
          {stage && <p className="text-xs text-muted-foreground" role="status">{stage}</p>}
        </div>}
        {lecture && <div className="space-y-3">
          <p className="font-semibold">{lecture.title}</p>
          <AiOutput text={lecture.summary} onInsert={() => insert(lecture.summary, "Lecture notes from AI")} />
          {!!lecture.key_concepts.length && <AiOutput text={lecture.key_concepts.map(k => `- ${k}`).join("\n")} onInsert={() => insert(lecture.key_concepts.map(k => `- ${k}`).join("\n"), "Key points from the lecture")} />}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={working} onClick={() => { setTab("study"); void runStudy("quiz", lecture.summary); }}><HelpCircle className="size-4" />Quiz from lecture</Button>
            <Button size="sm" variant="outline" disabled={working} onClick={() => { setTab("study"); void runStudy("guide", `${lecture.summary}\n\nSTUDENT NOTES:\n${noteText()}`); }}><Brain className="size-4" />Study guide</Button>
            <Button size="sm" variant="ghost" asChild><Link to="/lectures">Transcript & {lecture.cards} flashcards in Lecture Notes</Link></Button>
          </div>
          <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{lecture.transcript}</p></details>
        </div>}
      </>}
      {busy && busy !== "lecture" && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Thinking…</p>}
    </div>
    {(tab === "ask" || tab === "research" || tab === "explain" || tab === "study") && <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={e => { e.preventDefault(); if (tab === "ask" || tab === "research") void send(); }}>
      <Textarea value={input} onChange={e => setInput(e.target.value)} rows={2} placeholder={tab === "research" ? "Research a topic…" : tab === "explain" ? "Optional: what should it focus on?" : tab === "study" ? "Optional: what should the diagram show?" : "Ask about your notes…"} className="min-h-0 resize-none" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && (tab === "ask" || tab === "research")) { e.preventDefault(); void send(); } }} aria-label="Message to AI" data-no-voice />
      <VoiceTypeButton label="Speak your question" onText={t => setInput(v => (v.trim() ? v.trimEnd() + " " : "") + t)} />
      {(tab === "ask" || tab === "research") && <Button type="submit" size="icon" disabled={working || !input.trim()} aria-label="Send"><Send className="size-4" /></Button>}
    </form>}
  </aside></>;
}
