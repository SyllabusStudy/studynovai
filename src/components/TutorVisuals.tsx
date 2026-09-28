import { useEffect, useId, useRef, useState } from "react";

function Fallback({ code, note }: { code: string; note: string }) {
  return (
    <div className="my-2 rounded-xl border border-border bg-muted/40 p-2 text-xs">
      <p className="mb-1 text-muted-foreground">{note}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{code}</pre>
    </div>
  );
}

/** Flowcharts, timelines, concept maps, cycles and charts drawn with Mermaid. */
export function MermaidDiagram({ code }: { code: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
        const out = await mermaid.render(id, code.trim());
        if (alive) setSvg(out.svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, id]);
  if (failed) return <Fallback code={code} note="This diagram couldn't be drawn." />;
  return (
    <div
      className="my-2 flex justify-center overflow-x-auto rounded-xl border border-border bg-card p-3 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <p className="text-xs text-muted-foreground">Drawing diagram…</p>}
    </div>
  );
}

/** Real skeletal chemical structures from SMILES. First line = SMILES, optional second line = label. */
export function ChemStructure({ code }: { code: string }) {
  const lines = code.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const smiles = lines[0] ?? "";
  const label = lines.slice(1).join(" ");
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod: any = await import("smiles-drawer");
        const SD = mod.default ?? mod;
        const drawer = new SD.Drawer({ width: 320, height: 220, compactDrawing: false });
        const dark = document.documentElement.classList.contains("dark");
        SD.parse(
          smiles,
          (tree: unknown) => {
            if (alive && ref.current) drawer.draw(tree, ref.current, dark ? "dark" : "light", false);
          },
          () => alive && setFailed(true),
        );
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [smiles]);
  if (failed) return <Fallback code={smiles} note="This structure couldn't be drawn." />;
  return (
    <figure className="my-2 flex flex-col items-center rounded-xl border border-border bg-card p-3">
      <canvas ref={ref} width={320} height={220} className="max-w-full" />
      {label ? <figcaption className="mt-1 text-xs text-muted-foreground">{label}</figcaption> : null}
    </figure>
  );
}

/** Hand-drawn labeled diagrams (free-body, circuits, rays, cells) from sanitized SVG. */
export function SvgDiagram({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("dompurify").then(({ default: DOMPurify }) => {
      const clean = DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true } });
      if (alive) setHtml(clean.includes("<svg") ? clean : "");
    });
    return () => {
      alive = false;
    };
  }, [code]);
  if (html === "") return <Fallback code={code} note="This drawing couldn't be shown." />;
  return (
    <div
      className="my-2 flex justify-center rounded-xl border border-border bg-card p-3 text-foreground [&_svg]:h-auto [&_svg]:max-h-80 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
    />
  );
}
