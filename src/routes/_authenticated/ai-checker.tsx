import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { checkAiText } from "@/lib/ai.functions";
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

  async function check() {
    if (text.trim().length < 50) {
      toast.error("Paste at least a few sentences (50+ characters).");
      return;
    }
    setBusy(true);
    setResult(null);
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
