import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Crown, Loader2, ScanSearch, } from "lucide-react";
import { toast } from "sonner";
import { checkAiText, humanizeAiText } from "@/lib/ai.functions";
import { getBilling } from "@/lib/billing.functions";
import type { AiCheckResult } from "@/lib/ai-detect";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiKeySetupBanner, useAiKeyRedirect } from "@/lib/ai-key-gate";

export const Route = createFileRoute("/_authenticated/ai-checker")({
  head: () => ({
    meta: [
      { title: "AI Text Checker — SyllableStudy" },
      { name: "description", content: "Check how much of a text looks AI-written or human-written, and see where and why." },
      { property: "og:title", content: "AI Text Checker — SyllableStudy" },
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
    <div className="space-y-5">
      <PageHeader title="AI Text Checker" description="Paste your writing. See what sounds AI-written, and why." />
      <AiKeySetupBanner />
      <section className="surface-card space-y-3 p-4 sm:p-6">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="min-h-48 resize-y text-base sm:text-sm"
          placeholder="Paste an essay, paragraph or answer here…"
        />
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {words.toLocaleString()} words{text.length > 20000 ? " · first 20,000 characters are checked" : ""}
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex">
            {text ? (
              <Button variant="ghost" onClick={() => { setText(""); setResult(null); }} disabled={busy}>
                Clear
              </Button>
            ) : <span />}
            <Button size="lg" onClick={() => void check()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
              {busy ? "Checking…" : "Check text"}
            </Button>
          </div>
        </div>
      </section>

      {result ? (
        <section className="surface-card space-y-5 p-4 sm:p-6">
          <div className="flex items-center gap-5">
            <div
              className="relative flex size-24 shrink-0 items-center justify-center rounded-full"
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
                      {result.confidence[0]!.toUpperCase() + result.confidence.slice(1)}
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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-destructive/25" /> Likely AI</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-primary/20" /> Likely human</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-warning/25" /> Uncertain</span>
              {rewritten.size ? <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border-2 border-success" /> Revised</span> : null}
            </div>
            <p className="text-xs text-muted-foreground">Tap any highlighted part to see why it was flagged.</p>
            <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-sm leading-7">
              {result.spans.map((s, i) => (
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
              const sec = result.sections[openSection]!;
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
                <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm leading-7">
                  {humanized}
                </p>
                <MoreOptions label="Show my original text">
                  <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{original ?? ""}</p>
                </MoreOptions>
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
      ) : null}
    </div>
  );
}
