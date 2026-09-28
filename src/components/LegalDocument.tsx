type Block = { kind: "title" | "heading" | "subheading" | "bullet" | "text"; text: string };

function parse(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (index === 0) {
      blocks.push({ kind: "title", text: line });
      return;
    }
    if (line.startsWith("•")) {
      blocks.push({ kind: "bullet", text: line.replace(/^•\s*/, "") });
      return;
    }
    if (/^\d+\.\s+[A-Z0-9 ,&'/()-]+$/.test(line)) {
      blocks.push({ kind: "heading", text: line });
      return;
    }
    if (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 60) {
      blocks.push({ kind: "subheading", text: line });
      return;
    }
    blocks.push({ kind: "text", text: line });
  });
  return blocks;
}

export function LegalDocument({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <article className="space-y-3">
      {blocks.map((block, i) => {
        if (block.kind === "title") {
          return (
            <h1 key={i} className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
              {block.text}
            </h1>
          );
        }
        if (block.kind === "heading") {
          return (
            <h2 key={i} className="pt-6 text-lg font-bold tracking-tight">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "subheading") {
          return (
            <h3 key={i} className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "bullet") {
          return (
            <p key={i} className="ml-5 flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span aria-hidden="true">•</span>
              <span>{block.text}</span>
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {block.text}
          </p>
        );
      })}
    </article>
  );
}
