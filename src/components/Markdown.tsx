import { Fragment } from "react";

function inline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Small, dependency-free renderer for the subset of markdown the tutor produces. */
export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: JSX.Element[] = [];
  let list: string[] = [];

  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet?.[1] || numbered?.[1]) {
      list.push((bullet?.[1] ?? numbered?.[1])!);
      return;
    }
    flush();
    if (!line.trim()) return;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={index} className="mt-3 mb-1 text-sm font-bold tracking-tight">
          {inline(heading[2]!, `h-${index}`)}
        </p>,
      );
      return;
    }

    if (/^source:/i.test(line.trim())) {
      blocks.push(
        <p
          key={index}
          className="mt-2 inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
        >
          {line.trim()}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={index} className="my-1.5 leading-relaxed">
        {inline(line, `p-${index}`)}
      </p>,
    );
  });

  flush();
  return <div className="text-sm">{blocks}</div>;
}
