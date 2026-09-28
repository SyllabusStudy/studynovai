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
  FunctionSquare,
  Lightbulb,
  ListOrdered,
  PencilLine,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

/** Renders a tutor reply: "## " sections become colour-coded learning cards with KaTeX math. */
export function MathAnswer({ content }: { content: string }) {
  const text = normalizeMath(content);
  const parts = text.split(/^##\s+/m);
  const intro = parts[0]?.trim();
  const sections = parts.slice(1).map((chunk) => {
    const nl = chunk.indexOf("\n");
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().replace(/[*:]+$/g, "");
    const body = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    return { title, body };
  });

  return (
    <div className="space-y-2.5 text-sm [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1">
      {intro ? <Md>{intro}</Md> : null}
      {sections.map((s, i) => {
        const tone = TONES.find((t) => t.match.test(s.title))?.tone;
        const Icon = tone?.icon ?? BookOpen;
        const isFinal = /^final answer/i.test(s.title);
        return (
          <section key={i} className={cn("rounded-2xl border p-3.5 sm:p-4", tone?.className ?? "bg-card border-border")}>
            <h3 className="mb-1.5 flex items-center gap-2 font-display text-sm font-bold">
              <Icon className={cn("size-4 shrink-0", tone?.iconClass ?? "text-primary")} />
              {s.title}
            </h3>
            <div className={cn(isFinal && "text-base [&_.katex-display]:text-lg")}>
              <Md>{s.body}</Md>
            </div>
          </section>
        );
      })}
    </div>
  );
}
