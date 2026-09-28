import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Compass,
  Eye,
  FastForward,
  FunctionSquare,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  Pause,
  PencilLine,
  Play,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChemStructure, MermaidDiagram, SvgDiagram } from "@/components/TutorVisuals";

/** Convert \( \) and \[ \] delimiters to $ forms remark-math understands. */
function normalizeMath(src: string) {
  return src
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`);
}

type Tone = { icon: LucideIcon; className: string; iconClass: string };

const TONES: { match: RegExp; tone: Tone }[] = [
  { match: /^problem/i, tone: { icon: Target, className: "bg-muted/50 border-border", iconClass: "text-foreground" } },
  { match: /^understand/i, tone: { icon: BookOpen, className: "bg-card border-border", iconClass: "text-primary" } },
  { match: /^(method|another method)/i, tone: { icon: Compass, className: "bg-card border-primary/30", iconClass: "text-primary" } },
  { match: /^(key )?formula/i, tone: { icon: FunctionSquare, className: "bg-accent/15 border-accent/40", iconClass: "text-accent-foreground" } },
  { match: /^(steps|your work)/i, tone: { icon: ListOrdered, className: "bg-card border-primary/40", iconClass: "text-primary" } },
  { match: /^visual/i, tone: { icon: Eye, className: "bg-secondary/60 border-border", iconClass: "text-secondary-foreground" } },
  { match: /^common mistake/i, tone: { icon: AlertTriangle, className: "bg-destructive/10 border-destructive/40", iconClass: "text-destructive" } },
  { match: /^check/i, tone: { icon: CheckCircle2, className: "bg-primary/8 border-primary/30", iconClass: "text-primary" } },
  { match: /^final answer/i, tone: { icon: Trophy, className: "bg-primary/15 border-primary/60", iconClass: "text-primary" } },
  { match: /^remember/i, tone: { icon: Lightbulb, className: "bg-accent/15 border-accent/40", iconClass: "text-accent-foreground" } },
  { match: /^try this/i, tone: { icon: PencilLine, className: "bg-secondary/60 border-border", iconClass: "text-secondary-foreground" } },
];

function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h3: ({ children }) => (
          <h4 className="mt-4 mb-1 flex items-center gap-2 text-sm font-bold first:mt-0">
            <span className="h-4 w-1 rounded-full bg-primary" />
            {children}
          </h4>
        ),
        h1: ({ children }) => <h3 className="mt-3 mb-1 font-display text-base font-bold">{children}</h3>,
        h2: ({ children }) => <h3 className="mt-3 mb-1 font-display text-base font-bold">{children}</h3>,
        p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-center text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-border bg-muted px-2 py-1 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children }) => {
          const src = String(children ?? "");
          if (/language-mermaid/.test(className ?? "")) return <MermaidDiagram code={src} />;
          if (/language-(smiles|chem)/.test(className ?? "")) return <ChemStructure code={src} />;
          if (/language-svg/.test(className ?? "")) return <SvgDiagram code={src} />;
          if (className)
            return (
              <pre className="my-2 overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs">
                <code>{src}</code>
              </pre>
            );
          return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

const WHY_LINE = /^\s*(?:[-*]\s*)?\*\*Why\??\*\*\s*[:\-—]?\s*(.*)$/i;

/** Pulls "**Why?** …" lines out so they sit behind a tap-to-open button. */
function splitWhy(text: string) {
  const whys: string[] = [];
  const body = text
    .split("\n")
    .filter((line) => {
      const m = line.match(WHY_LINE);
      if (m && m[1]?.trim()) {
        whys.push(m[1].trim());
        return false;
      }
      return true;
    })
    .join("\n");
  return { body, why: whys.join(" ") };
}

function WhyButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <Button type="button" size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs" onClick={() => setOpen((o) => !o)}>
        <HelpCircle className="size-3.5" /> {open ? "Hide why" : "Why?"}
      </Button>
      {open ? (
        <div className="mt-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 animate-fade-in">
          <Md>{text}</Md>
        </div>
      ) : null}
    </div>
  );
}

function Piece({ text }: { text: string }) {
  const { body, why } = splitWhy(text);
  return (
    <div className="animate-fade-in">
      <Md>{body}</Md>
      {why ? <WhyButton text={why} /> : null}
    </div>
  );
}

type Section = { title: string; pieces: string[] };

/** Break a section into the small chunks that get revealed one after another. */
function toPieces(title: string, body: string): string[] {
  if (/^(steps|your work)/i.test(title) || /^###\s/m.test(body)) {
    const steps = body.split(/^(?=###\s)/m).map((s) => s.trim()).filter(Boolean);
    return steps.length ? steps : [body];
  }
  return body ? [body] : [];
}

const STEP_MS = 1400;

/** Renders a tutor reply: sections become colour-coded cards that build up step by step. */
export function MathAnswer({ content, animate = false }: { content: string; animate?: boolean }) {
  const text = normalizeMath(content);
  const parts = text.split(/^##\s+/m);
  const intro = parts[0]?.trim();
  const sections: Section[] = parts.slice(1).map((chunk) => {
    const nl = chunk.indexOf("\n");
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().replace(/[*:]+$/g, "");
    const body = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    return { title, pieces: toPieces(title, body) };
  }).reduce<Section[]>((acc, sec) => {
    // Method + Key formula share one card.
    const prev = acc[acc.length - 1];
    if (prev && /^method/i.test(prev.title) && /^(key )?formula/i.test(sec.title)) {
      prev.title = "Method & Key formula";
      prev.pieces.push(...sec.pieces);
      return acc;
    }
    acc.push(sec);
    return acc;
  }, []);

  // Flatten into a reveal order: intro, then each section heading+first piece, then later pieces.
  const order: { s: number; p: number }[] = [];
  if (intro) order.push({ s: -1, p: 0 });
  sections.forEach((sec, s) => {
    const n = Math.max(1, sec.pieces.length);
    for (let p = 0; p < n; p++) order.push({ s, p });
  });
  const total = order.length;

  const [shown, setShown] = useState(animate ? 1 : total);
  const [paused, setPaused] = useState(false);
  const done = shown >= total;

  useEffect(() => {
    if (!animate || paused || done) return;
    const t = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [animate, paused, done, shown]);

  const visible = (s: number, p: number) => {
    const idx = order.findIndex((o) => o.s === s && o.p === p);
    return idx !== -1 && idx < shown;
  };

  return (
    <div className="space-y-4 text-sm [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1">
      {intro && visible(-1, 0) ? <Piece text={intro} /> : null}
      {sections.map((sec, s) => {
        if (!visible(s, 0)) return null;
        const tone = TONES.find((t) => t.match.test(sec.title))?.tone;
        const Icon = tone?.icon ?? BookOpen;
        const isFinal = /^final answer/i.test(sec.title);
        if (/^(steps|your work)/i.test(sec.title)) {
          return (
            <div key={s} className="space-y-3">
              <h3 className="flex items-center gap-2 px-1 pt-1 font-display text-sm font-bold animate-fade-in">
                <Icon className={cn("size-4 shrink-0", tone?.iconClass ?? "text-primary")} />
                {/^your work/i.test(sec.title) ? sec.title : "Worked steps"}
              </h3>
              {sec.pieces.map((piece, p) => {
                if (!visible(s, p)) return null;
                const m = piece.match(/^###\s*(?:Step\s*\d+\s*[:.\-—]?\s*)?(.*)\n?([\s\S]*)$/i);
                const title = m?.[1]?.trim() ?? "";
                const body = m?.[2]?.trim() ?? piece;
                return (
                  <section key={p} className="rounded-2xl border border-primary/30 bg-card p-4 shadow-sm animate-fade-in sm:p-5">
                    <div className="mb-2 flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {p + 1}
                      </span>
                      <h4 className="font-display text-sm font-bold">{title || `Step ${p + 1}`}</h4>
                    </div>
                    <div className="[&_.katex-display]:my-3 [&_.katex-display]:text-[1.1rem]">
                      <Piece text={body} />
                    </div>
                  </section>
                );
              })}
            </div>
          );
        }
        return (
          <section
            key={s}
            className={cn("rounded-2xl border p-3.5 sm:p-4 animate-fade-in", tone?.className ?? "bg-card border-border")}
          >
            <h3 className={cn("flex items-center gap-2 font-display text-sm font-bold", isFinal ? "mb-4" : "mb-1.5")}>
              <Icon className={cn("size-4 shrink-0", tone?.iconClass ?? "text-primary")} />
              {sec.title}
            </h3>
            <div
              className={cn(
                "min-w-0 space-y-3",
                isFinal &&
                  "clear-both overflow-x-auto pt-1 text-base [&_.katex-display]:m-0 [&_.katex-display]:min-w-max [&_.katex-display]:py-2 [&_.katex-display]:text-sm sm:[&_.katex-display]:text-base",
              )}
            >
              {sec.pieces.map((piece, p) => (visible(s, p) ? <Piece key={p} text={piece} /> : null))}
            </div>
          </section>
        );
      })}

      {animate && !done ? (
        <div className="sticky bottom-2 flex items-center justify-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {paused ? "Paused" : "Working it out…"} {shown}/{total}
          </span>
          <Button type="button" size="sm" variant="secondary" className="h-7 rounded-full px-3 text-xs" onClick={() => setPaused((v) => !v)}>
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />} {paused ? "Continue" : "Pause"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs" onClick={() => setShown(total)}>
            <FastForward className="size-3.5" /> Show all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
