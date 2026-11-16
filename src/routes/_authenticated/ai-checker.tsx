import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Copy, Crown, FileUp, Fingerprint, Loader2, NotebookPen, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { listPersonalNotes } from "@/lib/notes.functions";
import { readTextFromFile } from "@/lib/checker-import";
import { writingStats } from "@/lib/writing-stats";
import { toast } from "sonner";
import { checkAiText, humanizeAiText } from "@/lib/ai.functions";
import { getBilling } from "@/lib/billing.functions";
import type { AiCheckResult } from "@/lib/ai-detect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiKeySetupBanner, useAiKeyRedirect } from "@/lib/ai-key-gate";

export const Route = createFileRoute("/_authenticated/ai-checker")({
  head: () => ({
    meta: [
      { title: "AI Text Checker — SyllabusStudy" },
      { name: "description", content: "Check how much of a text looks AI-written or human-written, and see where and why." },
      { property: "og:title", content: "AI Text Checker — SyllabusStudy" },
      { property: "og:description", content: "Estimate AI vs. human writing with passage-by-passage reasons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiCheckerPage,
});

const LABELS = {
  ai: { text: "Likely AI", cls: "bg-destructive/15 text-destructive" },
  human: { text: "Likely human", cls: "bg-primary/15 text-primary" },
  mixed: { text: "Mixed", cls: "bg-secondary text-secondary-foreground" },
} as const;

function AiCheckerPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiCheckResult | null>(null);
  const run = useServerFn(checkAiText);
  const humanize = useServerFn(humanizeAiText);
  const loadBilling = useServerFn(getBilling);
  const redirectForKey = useAiKeyRedirect();
  const [pro, setPro] = useState<boolean | null>(null);
  const [humanizing, setHumanizing] = useState(false);
  const [rewritten, setRewritten] = useState<Set<number>>(new Set());
  const [openSection, setOpenSection] = useState<number | null>(null);
  // One revision per check — avoids a rewrite → detect → rewrite loop.
  const [improved, setImproved] = useState(false);
  const [humanized, setHumanized] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [tone, setTone] = useState<"natural" | "academic" | "casual" | "concise">("natural");
  const [beforePercent, setBeforePercent] = useState<number | null>(null);
  const [recheck, setRecheck] = useState<AiCheckResult | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notes, setNotes] = useState<{ id: string; title: string; plain_text: string | null }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadNotes = useServerFn(listPersonalNotes);
  const stats = useMemo(() => (result && !humanized ? writingStats(result.spans.map((s) => s.text).join("")) : null), [result, humanized]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const t = await readTextFromFile(file);
      if (t.length < 50) return void toast.error("Couldn't find enough text in that file.");
      setText(t.slice(0, 20000));
      setResult(null);
      toast.success(`Loaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  }

  async function openNotes() {
    if (notes) return setNotes(null);
    try {
      const n = await loadNotes();
      setNotes((n ?? []).filter((x) => (x.plain_text ?? "").trim().length >= 50));
    } catch {
      toast.error("Your notes couldn't be loaded.");
    }
  }

  async function doRecheck() {
    if (!humanized || rechecking) return;
    setRechecking(true);
    try {
      const res = await run({ data: { text: humanized.slice(0, 20000) } });
      if (res.error) { if (!redirectForKey(res.error)) toast.error(res.error); }
      else setRecheck(res.result);
    } catch {
      toast.error("I'm having trouble connecting right now. Try again in a moment.");
    } finally {
      setRechecking(false);
    }
  }

  useEffect(() => {
    loadBilling()
      .then((b) => setPro(b.plan === "pro"))
      .catch(() => setPro(false));
  }, [loadBilling]);

  const aiIdx = result ? result.spans.map((s, i) => (s.label === "ai" && s.text.trim() && !rewritten.has(i) ? i : -1)).filter((i) => i >= 0) : [];

  async function doHumanize() {
    if (!result || !aiIdx.length || humanizing) return;
    setHumanizing(true);
    try {
      const res = await humanize({
        data: {
          sentences: aiIdx.map((i) => ({ index: i, text: (result.spans[i]?.text ?? "").slice(0, 2000) })),
          context: result.spans.map((s) => s.text).join(""),
          tone,
        },
      });
      if (res.error || !res.text) {
        if (!redirectForKey(res.error)) toast.error(res.error ?? "Couldn't rewrite that just now.");
        return;
      }
      const nextText = res.text.trim();
      if (!nextText || nextText === result.spans.map((s) => s.text).join("").trim()) {
        toast.error("Couldn't produce a meaningful rewrite yet. Please try again.");
        return;
      }
      setImproved(true);
      setBeforePercent(result.aiPercent);
      setRecheck(null);
      setResult({ ...result, spans: [{ text: nextText, label: "human", section: 0 }] });
      setRewritten(new Set([0]));
      setText(nextText);
      setHumanized(nextText);
      toast.success("Your passage was meaningfully rewritten while keeping its message.");
    } catch {
      toast.error("I'm having trouble connecting right now. Try again in a moment.");
    } finally {
      setHumanizing(false);
    }
  }

  async function check() {
    if (text.trim().length < 50) {
      toast.error("Paste at least a few sentences (50+ characters).");
      return;
    }
    setBusy(true);
    setResult(null);
    setRewritten(new Set());
    setImproved(false);
    setHumanized(null);
    setOriginal(text);
    setRecheck(null);
    setBeforePercent(null);
    setOpenSection(null);
    try {
      const res = await run({ data: { text: text.slice(0, 20000) } });
      if (res.error) {
        if (!redirectForKey(res.error)) toast.error(res.error);
      } else setResult(res.result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The checker could not run.";
      if (!redirectForKey(msg)) toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="ai-checker space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 py-2 sm:py-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-info"><Fingerprint className="size-4" /> Writing insights</div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">AI Text Checker<span className="text-info">.</span></h1>
          <p className="mt-3 text-sm text-muted-foreground">A closer look at your writing.</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-info" /> {busy ? "Analysis in progress" : result ? "Analysis complete" : "Ready to analyze"}</span>
      </header>
      <AiKeySetupBanner />
      <div className="ai-checker-workspace">
      <section
        aria-label="Your writing"
        className={cn("ai-checker-editor flex min-w-0 flex-col p-4 sm:p-6 transition", busy && "ai-checker-scanning", dragging && "ring-2 ring-info")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void importFile(e.dataTransfer.files[0]); }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><span className="ai-checker-step">01</span> Your writing</h2>
          <span className="text-xs text-muted-foreground">{words.toLocaleString()} words</span>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,text/plain,application/pdf" className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" /> Upload file
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void openNotes()}>
            <NotebookPen className="size-4" /> From my notes
          </Button>
        </div>
        {notes ? (
          <div className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {notes.length ? notes.map((n) => (
              <Button key={n.id} type="button" variant="ghost" className="w-full justify-start truncate px-2 py-1.5 text-left text-sm"
                onClick={() => { setText((n.plain_text ?? "").slice(0, 20000)); setNotes(null); setResult(null); }}>
                {n.title || "Untitled note"}
              </Button>
            )) : <p className="p-2 text-sm text-muted-foreground">No notes with enough text yet.</p>}
          </div>
        ) : null}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          aria-label="Text to check"
          className="ai-checker-text min-h-80 flex-1 resize-y text-base leading-7 sm:text-sm"
          placeholder="Paste an essay, paragraph or answer here…"
        />
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            PDF, Word, TXT or Markdown{text.length > 20000 ? " · first 20,000 characters are checked" : ""}
          </p>
          <div className="flex gap-2">
            {text ? (
              <Button variant="outline" size="icon" title="Clear text" aria-label="Clear text" onClick={() => { setText(""); setResult(null); }} disabled={busy} className="size-11 shrink-0">
                <Trash2 className="size-4" />
              </Button>
            ) : <span />}
            <Button size="lg" onClick={() => void check()} disabled={busy} className="ai-checker-submit h-11 flex-1 gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
              {busy ? "Checking…" : "Check text"}
              {!busy ? <ArrowUpRight className="ml-auto size-4" /> : null}
            </Button>
          </div>
        </div>
      </section>

      {result ? (
        <section aria-label="Writing analysis" className="ai-checker-results ai-checker-rise min-w-0 space-y-5 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><span className="ai-checker-step">02</span> Your analysis</h2>
          <div className="flex items-center gap-5">
            <div
              className="ai-checker-ring relative flex size-24 shrink-0 items-center justify-center"
              style={{ background: result.verdict === "insufficient" ? "var(--muted)" : `conic-gradient(var(--destructive) ${result.aiPercent * 3.6}deg, color-mix(in oklab, var(--primary) 35%, transparent) 0)` }}
              aria-hidden="true"
            >
              <div className="flex size-18 flex-col items-center justify-center rounded-full bg-card">
                <span className="font-display text-xl font-bold">{result.verdict === "insufficient" ? "—" : `${result.aiPercent}%`}</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">AI</span>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-display text-lg font-bold">{result.verdictText}</p>
              {result.verdict === "insufficient" ? (
                <p className="text-sm text-muted-foreground">There isn't enough evidence to make a reliable assessment. Add more text (about 80 words or more).</p>
              ) : (
                <>
                  <p className="text-sm">AI likelihood: <span className="font-semibold">{result.aiPercent}%</span></p>
                  <p className="text-sm">
                    Confidence:{" "}
                    <span className={cn("font-semibold", result.confidence === "high" ? "text-success" : result.confidence === "medium" ? "text-warning" : "text-muted-foreground")}>
                      {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)}
                    </span>
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">{result.words.toLocaleString()} words analyzed · {result.sections.length} section{result.sections.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          {result.cautions.length ? (
            <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              {result.cautions.map((c) => <p key={c}>{c}</p>)}
            </div>
          ) : null}

          {stats && stats.sentences >= 3 ? (
            <div className="ai-checker-metrics grid gap-4 border-y border-border py-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Sentence variety</p>
                <p className="font-display text-lg font-bold">{stats.variety}%</p>
                <div className="mt-1 flex h-8 items-end gap-px">
                  {stats.lengths.slice(0, 40).map((l, i) => (
                    <span key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${Math.min(100, (l / Math.max(...stats.lengths)) * 100)}%` }} />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{stats.variety < 35 ? "Sentences are very even — mix short and long." : "Good mix of short and long sentences."}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Average sentence</p>
                <p className="font-display text-lg font-bold">{stats.avgSentenceWords} words</p>
                <p className="text-[11px] text-muted-foreground">{stats.sentences} sentences · ~{stats.readingMinutes} min read</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">AI-sounding phrases</p>
                <p className="font-display text-lg font-bold">{stats.cliches.reduce((a, c) => a + c.count, 0)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {stats.cliches.slice(0, 6).map((c) => (
                    <span key={c.phrase} className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">{c.phrase}{c.count > 1 ? ` ×${c.count}` : ""}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-destructive/25" /> Likely AI</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-primary/20" /> Likely human</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-warning/25" /> Uncertain</span>
              {rewritten.size ? <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border-2 border-success" /> Revised</span> : null}
            </div>
            <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-sm leading-7">
              {result.spans.map((s, i) => !s.text.trim() ? <span key={i}>{s.text}</span> : (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenSection(s.section)}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpenSection(s.section); }}
                  className={cn(
                    "cursor-pointer rounded-sm box-decoration-clone px-0.5",
                    openSection === s.section && "ring-1 ring-foreground/40",
                    rewritten.has(i)
                      ? "bg-success/15 underline decoration-success decoration-2 underline-offset-4"
                      : s.label === "ai"
                        ? "bg-destructive/20"
                        : s.label === "mixed"
                          ? "bg-warning/20"
                          : "bg-primary/10",
                  )}
                >
                  {s.text}
                </span>
              ))}
            </div>
            {openSection !== null && result.sections[openSection] ? (() => {
              const sec = result.sections[openSection];
              if (!sec) return null;
              return (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Why this section was flagged</p>
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", LABELS[sec.label].cls)}>
                      {LABELS[sec.label].text} · {sec.aiPercent}%
                    </span>
                  </div>
                  {sec.reasons.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {sec.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No strong signals in this section on their own.</p>
                  )}
                </div>
              );
            })() : null}
            <div className="flex flex-wrap items-center gap-2">
              {pro && aiIdx.length ? (
                <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} aria-label="Rewrite tone"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="natural">Natural student</option>
                  <option value="academic">Academic</option>
                  <option value="casual">Casual</option>
                  <option value="concise">Concise</option>
                </select>
              ) : null}
              {pro ? (
                <Button onClick={() => void doHumanize()} disabled={humanizing || !aiIdx.length} className="gap-1.5">
                  {humanizing ? <Loader2 className="size-4 animate-spin" /> : null}
                  {humanizing ? "Humanizing…" : aiIdx.length ? `✨ Humanize (${aiIdx.length})` : "✨ Humanized"}
                  <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-bold uppercase">Pro</span>
                </Button>
              ) : pro === false ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/upgrade">✨ Humanize <span aria-hidden="true">🔒</span> <Crown className="size-4" /> Pro</Link>
                </Button>
              ) : null}
              {rewritten.size ? (
                <Button
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => void navigator.clipboard.writeText(result.spans.map((s) => s.text).join("")).then(() => toast.success("Copied."))}
                >
                  <Copy className="size-4" /> Copy text
                </Button>
              ) : null}
            </div>
            {humanized ? (
              <div className="space-y-3 rounded-xl border border-success/40 bg-success/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Humanized version</p>
                  <span className="text-xs text-muted-foreground">Meaningfully rewritten</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Before{beforePercent !== null ? ` · ${beforePercent}% AI` : ""}</p>
                    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm leading-7 text-muted-foreground">{original ?? ""}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-success">After{recheck ? ` · ${recheck.aiPercent}% AI` : ""}</p>
                    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-success/40 bg-background/60 p-3 text-sm leading-7">{humanized}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void doRecheck()} disabled={rechecking}>
                    {rechecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Re-check new version
                  </Button>
                  {recheck && beforePercent !== null ? (
                    <span className="text-sm">{beforePercent}% → <span className="font-semibold">{recheck.aiPercent}%</span> AI</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {rewritten.size ? <p className="text-xs text-muted-foreground">The rewritten version is underlined in green and now appears in your text box. This improves natural writing quality; it does not guarantee any detector result.</p> : null}
          </div>

          <MoreOptions label="Why did we flag this?">
            {result.reasons.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No strong writing-style signals were found across the whole text.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Style signals: {result.localPercent}% AI-leaning{result.modelPercent !== null ? ` · AI reader: ${result.modelPercent}%` : ""}
            </p>
          </MoreOptions>
          <p className="text-xs text-muted-foreground">
            AI detection is an estimate, not proof. It can produce false positives and false negatives and can't show who wrote something. This is not a plagiarism check.
          </p>
        </section>
      ) : (
        <section aria-label="Writing analysis" className="ai-checker-results flex min-w-0 flex-col p-4 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><span className="ai-checker-step">02</span> Your analysis</h2>
          <div className="ai-checker-empty flex min-h-80 flex-1 flex-col items-center justify-center gap-6 py-10 text-center" aria-live="polite">
            <div className={cn("ai-checker-fingerprint", busy && "is-scanning")}><Fingerprint className="size-24 stroke-1" /><span /></div>
            <div>
              <h3 className="font-display text-lg font-semibold">{busy ? "Reading between the lines…" : "Every word has a pattern"}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{busy ? "Analyzing your writing style" : "Your writing insights will appear here."}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-destructive" /> AI</span>
              <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" /> Human</span>
              <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-warning" /> Mixed</span>
            </div>
          </div>
          <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">AI detection is an estimate, not proof of authorship.</p>
        </section>
      )}
      </div>
    </div>
  );
}
