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

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Text Checker"
        description="Paste your writing. See what sounds AI-written, and why."
      />
      <div className="surface-card space-y-3 p-5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste an essay, paragraph or answer here…"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {text.length.toLocaleString()} characters · first 8,000 are checked in one quick scan
          </p>
          <Button onClick={() => void check()} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            Check text
          </Button>
        </div>
      </div>

      {result ? (
        <div className="surface-card space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-destructive/10 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">AI</p>
              <p className="font-display text-3xl font-bold text-destructive">{result.aiPercent}%</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Human</p>
              <p className="font-display text-3xl font-bold text-primary">{result.humanPercent}%</p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary/30">
            <div className="h-full bg-destructive" style={{ width: `${result.aiPercent}%` }} />
          </div>
          {result.verdict ? <p className="text-sm">{result.verdict}</p> : null}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Where and why</p>
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
          <p className="text-xs text-muted-foreground">
            This is an estimate — no AI detector is 100% accurate. Don't use it as the only proof.
          </p>
        </div>
      ) : null}
    </div>
  );
}
