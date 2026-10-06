import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, Brain, Check, Copy, ExternalLink, HelpCircle, Lightbulb, Loader2, Mic, Network, Pause, Play, Plus, Search, Send, Sparkles, Square, SpellCheck, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

function AiOutput({ text, onInsert, sources }: { text: string; onInsert: () => void; sources?: NotesAiResult["sources"] | undefined }) {
  return <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
    <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary"><Sparkles className="size-3" />AI — not part of your notes</div>
    <div className="notes-ai-output prose-sm max-w-none [&_h1]:text-base [&_h2]:text-sm [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />
    {!!sources?.length && <div className="mt-3 border-t border-border pt-2"><p className="mb-1 text-xs font-semibold text-muted-foreground">Sources</p>
      <ul className="space-y-1">{sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-xs text-primary hover:underline"><ExternalLink className="mt-0.5 size-3 shrink-0" />{s.title}</a></li>)}</ul></div>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={onInsert}><Plus className="size-4" />Insert into Notes</Button>
      <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="size-4" />Copy</Button>
    </div>
  </div>;
}

export function NotesAiPanel({ open, onClose, editor, title, classId, onAddDiagram, onRecordingChange, onBadge }: {
  open: boolean; onClose: () => void; editor: Editor | null; title: string; classId: string | null;
  onAddDiagram: (els: DrawEl[]) => void; onRecordingChange: (label: string | null) => void; onBadge: (count: number) => void;
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
  const [study, setStudy] = useState<NotesAiResult | null>(null);
  const [quizPick, setQuizPick] = useState<Record<number, number>>({});

  const noteText = () => editor?.getText() ?? "";
  // ---- Always-on helpers (on by default, each can be switched off; choice remembered on this device) ----
  const [autoSpell, setAutoSpell] = useState(true);
  const [autoFeedback, setAutoFeedback] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [feedbackNew, setFeedbackNew] = useState(false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem("studynova-notes-ai-auto") ?? "{}"); if (v.spell === false) setAutoSpell(false); if (v.feedback === false) setAutoFeedback(false); } catch { /* ignore */ }
  }, []);
  const saveAuto = (spell: boolean, fb: boolean) => localStorage.setItem("studynova-notes-ai-auto", JSON.stringify({ spell, feedback: fb }));
  const autoState = useRef({ spellText: "", fbText: "", spellBusy: false, fbBusy: false, lastFb: 0 });
  useEffect(() => {
    if (!editor) return;
    let spellTimer: ReturnType<typeof setTimeout> | undefined, fbTimer: ReturnType<typeof setTimeout> | undefined;
    const quiet = (e: unknown) => { if (e instanceof Error && /free limit|API key/i.test(e.message)) { setAutoSpell(false); setAutoFeedback(false); } };
    const runSpell = async () => {
      const text = editor.getText(); const st = autoState.current;
      if (st.spellBusy || text.trim().length < 15 || text === st.spellText) return;
      st.spellBusy = true; st.spellText = text;
      try {
        const r = await ai({ data: { action: "spelling", noteText: text, selection: "", question: "", writeMode: "", history: [] } });
        if (r.error) { quiet(new Error(r.error)); return; }
        const current = editor.getText();
        setSuggestions(prev => [...prev.filter(s => s.state), ...r.suggestions.filter(s => current.includes(s.original))]);
      } catch (e) { quiet(e); } finally { st.spellBusy = false; }
    };
    const runFeedback = async () => {
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
      if (autoSpell) { clearTimeout(spellTimer); spellTimer = setTimeout(() => void runSpell(), 2500); }
      if (autoFeedback) { clearTimeout(fbTimer); fbTimer = setTimeout(() => void runFeedback(), 8000); }
    };
    editor.on("update", onUpdate);
    if (autoSpell) spellTimer = setTimeout(() => void runSpell(), 1500);
    if (autoFeedback) fbTimer = setTimeout(() => void runFeedback(), 4000);
    return () => { editor.off("update", onUpdate); clearTimeout(spellTimer); clearTimeout(fbTimer); };
  }, [editor, autoSpell, autoFeedback, ai]);
  const selection = () => { if (!editor) return ""; const { from, to } = editor.state.selection; return from === to ? "" : editor.state.doc.textBetween(from, to, "\n"); };
  const insert = (md: string, label = "From AI Assistant") => {
    if (!editor) return;
    editor.chain().focus("end").insertContent(`<p><em>✨ ${label}</em></p>${markdownToHtml(md)}`).run();
    toast.success("Added to your note");
  };

  const call = async (action: NotesAiAction, extra: { question?: string; history?: Msg[]; noteText?: string | undefined } = {}) => {
    setBusy(action);
    try {
      const r = await ai({ data: { action, noteText: extra.noteText ?? noteText(), selection: selection(), question: extra.question ?? "", writeMode, history: (extra.history ?? []).slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 20000) })) } });
      if (r.error) { toast.error(r.error); return null; }
      return r;
    } catch (e) { toast.error(e instanceof Error ? e.message : "The AI couldn't answer right now."); return null; }
    finally { setBusy(null); }
  };

  const send = async () => {
    const q = input.trim(); if (!q) return;
    setInput("");
    if (tab === "research") {
      const next = [...research, { role: "user" as const, content: q }]; setResearch(next);
      const r = await call("research", { question: q });
      if (r) setResearch([...next, { role: "assistant", content: r.text, sources: r.sources }]);
    } else {
      const next = [...chat, { role: "user" as const, content: q }]; setChat(next);
      const r = await call("ask", { question: q, history: chat });
      if (r) setChat([...next, { role: "assistant", content: r.text, sources: r.sources }]);
    }
  };

  const replaceInDoc = (s: NotesAiSuggestion) => {
    if (!editor) return false;
    let range: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (range || !node.isText || !node.text) return !range;
      const i = node.text.indexOf(s.original);
      if (i >= 0) range = { from: pos + i, to: pos + i + s.original.length };
      return false;
    });
    if (!range) return false;
    editor.chain().focus().insertContentAt(range, s.suggestion).run();
    return true;
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
  useEffect(() => () => { stream.current?.getTracks().forEach(t => t.stop()); }, []);

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

  const openSpell = suggestions.filter(x => !x.state).length;
  useEffect(() => { onBadge(openSpell + (feedbackNew ? 1 : 0)); }, [openSpell, feedbackNew, onBadge]);
  useEffect(() => { if (open && tab === "ask") setFeedbackNew(false); }, [open, tab, feedback]);
  const thread = tab === "research" ? research : chat;
  const working = !!busy;

  return <aside aria-label="AI Assistant" className={cn(open ? "flex" : "hidden", "fixed inset-0 z-50 flex-col bg-background lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100dvh-2rem)] lg:w-[380px] lg:shrink-0 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-card")}>
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <p className="flex items-center gap-2 font-display font-bold"><Sparkles className="size-4 text-primary" />AI Assistant</p>
      <Button size="icon" variant="ghost" aria-label="Close AI Assistant" onClick={onClose}><X className="size-5" /></Button>
    </div>
    <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2" role="tablist">
      {TABS.map(t => <Button key={t.id} role="tab" aria-selected={tab === t.id} size="sm" variant={tab === t.id ? "default" : "ghost"} onClick={() => setTab(t.id)} className="shrink-0"><t.Icon className="size-4" />{t.label}{t.id === "lecture" && rec !== "idle" && <span className="size-2 animate-pulse rounded-full bg-destructive" />}</Button>)}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs">
      <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={autoSpell} onChange={e => { setAutoSpell(e.target.checked); saveAuto(e.target.checked, autoFeedback); }} />Auto spelling fixes</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={autoFeedback} onChange={e => { setAutoFeedback(e.target.checked); saveAuto(autoSpell, e.target.checked); }} />Auto feedback on my notes</label>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {tab === "ask" && autoFeedback && feedback && <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Feedback on your notes (updates as you write)</p><AiOutput text={feedback} onInsert={() => insert(feedback, "AI feedback")} /></div>}
      {tab !== "writing" && openSpell > 0 && <button type="button" onClick={() => setTab("writing")} className="w-full rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm"><SpellCheck className="mr-1 inline size-4" />{openSpell} spelling/grammar fix{openSpell > 1 ? "es" : ""} ready — review</button>}
      {(tab === "ask" || tab === "research") && <>
        <p className="text-xs text-muted-foreground">{tab === "ask" ? "Ask anything while you take notes. Answers stay here until you choose to add them." : "Look up outside information with sources. It stays separate from your notes."}</p>
        {!thread.length && <div className="flex flex-wrap gap-2">{(tab === "ask" ? ["Explain this in simple terms", "Can you give me an example?", "What should I know for the exam?"] : ["Latest research on this topic", "History and key people", "Real-world applications"]).map(q => <Button key={q} size="sm" variant="outline" onClick={() => setInput(q)}>{q}</Button>)}</div>}
        {thread.map((m, i) => m.role === "user" ? <div key={i} className="ml-8 rounded-lg bg-secondary px-3 py-2 text-sm">{m.content}</div> : <AiOutput key={i} text={m.content} sources={m.sources} onInsert={() => insert(m.content, tab === "research" ? "Research (outside sources)" : "From AI Assistant")} />)}
      </>}
      {tab === "explain" && <>
        <p className="text-xs text-muted-foreground">Highlight part of your note, then tap Explain. With nothing selected, it explains the main idea.</p>
        <Button onClick={async () => { const r = await call("explain", { question: input.trim() }); if (r) setExplain(r.text); }} disabled={working}><Lightbulb className="size-4" />Explain</Button>
        {explain && <AiOutput text={explain} onInsert={() => insert(explain, "Explanation from AI")} />}
      </>}
      {tab === "writing" && <>
        <p className="text-xs text-muted-foreground">Spelling and grammar are checked automatically as you write. Nothing in your note changes until you tap Accept. Select text and use the buttons to improve just that part.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={working} onClick={async () => { const r = await call("spelling"); if (r) { setSuggestions(r.suggestions); if (!r.suggestions.length) toast.success("No spelling or grammar mistakes found"); } }}><SpellCheck className="size-4" />Spelling & grammar</Button>
          {["better wording", "make clearer", "make shorter", "expand", "rewrite", "academic tone"].map(m => <Button key={m} size="sm" variant={writeMode === m ? "secondary" : "outline"} disabled={working} onClick={async () => { setWriteMode(m); setBusy("improve"); try { const r = await ai({ data: { action: "improve", noteText: noteText(), selection: selection(), question: "", writeMode: m, history: [] } }); if (r.error) toast.error(r.error); else { setSuggestions(r.suggestions); if (!r.suggestions.length) toast.message("No changes suggested"); } } finally { setBusy(null); } }} className="capitalize">{m}</Button>)}
        </div>
        {suggestions.map((s, i) => <div key={i} className={cn("rounded-lg border border-border p-3 text-sm", s.state && "opacity-60")}>
          <p className="text-muted-foreground line-through decoration-destructive/60">{s.original}</p>
          <p className="mt-1 font-medium">{s.suggestion}</p>
          {s.reason && <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>}
          {s.state ? <p className="mt-2 text-xs">{s.state === "accepted" ? "Accepted" : "Ignored"}</p> : <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { if (replaceInDoc(s)) setSuggestions(x => x.map((y, j) => j === i ? { ...y, state: "accepted" } : y)); else toast.error("That text changed or spans formatting — copy the suggestion instead."); }}><Check className="size-4" />Accept</Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestions(x => x.map((y, j) => j === i ? { ...y, state: "rejected" } : y))}>Reject</Button>
          </div>}
        </div>)}
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
    {(tab === "ask" || tab === "research" || tab === "explain" || tab === "study") && <form className="flex gap-2 border-t border-border p-3" onSubmit={e => { e.preventDefault(); if (tab === "ask" || tab === "research") void send(); }}>
      <Textarea value={input} onChange={e => setInput(e.target.value)} rows={2} placeholder={tab === "research" ? "Research a topic…" : tab === "explain" ? "Optional: what should it focus on?" : tab === "study" ? "Optional: what should the diagram show?" : "Ask about your notes…"} className="min-h-0 resize-none" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && (tab === "ask" || tab === "research")) { e.preventDefault(); void send(); } }} aria-label="Message to AI" />
      {(tab === "ask" || tab === "research") && <Button type="submit" size="icon" disabled={working || !input.trim()} aria-label="Send"><Send className="size-4" /></Button>}
    </form>}
  </aside>;
}
