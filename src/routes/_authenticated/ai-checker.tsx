import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Crown, Loader2, ScanSearch, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { checkAiText, humanizeAiText } from "@/lib/ai.functions";
import { getBilling } from "@/lib/billing.functions";
import type { AiCheckResult } from "@/lib/study.server";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-checker")({
  head: () => ({
    meta: [
      { title: "AI Text Checker — StudyNova" },
      { name: "description", content: "Check how much of a text looks AI-written or human-written, and see where and why." },
      { property: "og:title", content: "AI Text Checker — StudyNova" },
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
  const [pro, setPro] = useState<boolean | null>(null);
  const [humanizing, setHumanizing] = useState(false);
  const [rewritten, setRewritten] = useState<Set<number>>(new Set());

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
          sentences: aiIdx.map((i) => ({ index: i, text: result.spans[i].text.slice(0, 2000) })),
          context: result.spans.map((s) => s.text).join(""),
        },
      });
      if (res.error || !res.rewrites) {
        toast.error(res.error ?? "Couldn't rewrite that just now.");
        return;
      }
      const map = res.rewrites as Record<string, string>;
      const done = new Set(rewritten);
      const spans = result.spans.map((s, i) => {
        const r = map[String(i)];
        if (!r) return s;
        done.add(i);
        const trail = s.text.match(/\s*$/)?.[0] ?? " ";
        return { text: r + (trail || " "), label: s.label };
      });
      const nextResult = { ...result, spans };
      setResult(nextResult);
      setRewritten(done);
      setText(spans.map((s) => s.text).join(""));
      toast.success(`Humanized ${Object.keys(map).length} sentence${Object.keys(map).length === 1 ? "" : "s"}.`);
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
    try {
      const res = await run({ data: { text: text.slice(0, 20000) } });
      if (res.error) toast.error(res.error);
      else setResult(res.result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The checker could not run.");
    } finally {
      setBusy(false);
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-5">
      <PageHeader title="AI Text Checker" description="Paste your writing. See what sounds AI-written, and why." />
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
            {words.toLocaleString()} words{text.length > 8000 ? " · first 8,000 characters are checked" : ""}
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
              style={{ background: `conic-gradient(var(--destructive) ${result.aiPercent * 3.6}deg, color-mix(in oklab, var(--primary) 35%, transparent) 0)` }}
              aria-hidden="true"
            >
              <div className="flex size-18 flex-col items-center justify-center rounded-full bg-card">
                <span className="font-display text-xl font-bold">{result.aiPercent}%</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">AI</span>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-display text-lg font-bold">
                {result.aiPercent >= 60 ? "Sounds mostly AI" : result.aiPercent >= 35 ? "A bit of both" : "Sounds mostly human"}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-destructive">{result.aiPercent}% AI</span>
                {" · "}
                <span className="font-semibold text-primary">{result.humanPercent}% human</span>
              </p>
              {result.verdict ? <p className="text-sm text-muted-foreground">{result.verdict}</p> : null}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-destructive/25" /> AI-written</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-primary/20" /> Human-written</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-warning/25" /> Mixed</span>
              {rewritten.size ? <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border-2 border-success" /> Humanized</span> : null}
            </div>
            <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-sm leading-7">
              {result.spans.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-sm box-decoration-clone px-0.5",
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
            <div className="flex flex-wrap items-center gap-2">
              {pro ? (
                <Button onClick={() => void doHumanize()} disabled={humanizing || !aiIdx.length} className="gap-1.5">
                  {humanizing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  {humanizing ? "Humanizing…" : aiIdx.length ? `Humanize AI parts (${aiIdx.length})` : "Nothing AI left to humanize"}
                </Button>
              ) : pro === false ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/upgrade"><Crown className="size-4" /> Humanize — Pro only</Link>
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
            {rewritten.size ? <p className="text-xs text-muted-foreground">Your text box was updated. Press Check text to re-scan it.</p> : null}
          </div>
          {result.sections.length ? (
            <MoreOptions label={`Where and why (${result.sections.length})`}>
              <div className="space-y-2">
                {result.sections.map((s, i) => (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", LABELS[s.label].cls)}>
                      {LABELS[s.label].text}
                    </span>
                    <p className="mt-2 text-sm italic text-muted-foreground">"{s.excerpt}…"</p>
                    <p className="mt-1 text-sm">{s.reason}</p>
                  </div>
                ))}
              </div>
            </MoreOptions>
          ) : null}
          <p className="text-xs text-muted-foreground">An estimate only — no AI detector is 100% accurate.</p>
        </section>
      ) : null}
    </div>
  );
}
