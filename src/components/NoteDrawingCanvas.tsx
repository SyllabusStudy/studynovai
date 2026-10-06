import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ArrowUpRight, Circle, Diamond, Eraser, Hand, Highlighter, Minus, MousePointer2, PenLine, Plus, Redo2, Scissors, Sparkles, Square, Trash2, Triangle, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PAGE_H, PAGE_W, bounds, boxesTouch, eraseArea, hitTest, newPage, recognize, shapeOutline, strokePath, transformEl, uid, unionBox,
  type Box, type DrawEl, type Drawing, type Pt, type ShapeEl, type ShapeKind, type StrokeEl,
} from "@/lib/note-drawing";

type Tool = "select" | "pen" | "highlighter" | "eraser" | "area" | ShapeKind;
const INKS = ["var(--foreground)", "var(--primary)", "var(--destructive)", "var(--success)", "var(--warning)", "var(--feature-flashcards)"];
const HIGHLIGHTS = ["var(--warning)", "var(--success)", "var(--feature-flashcards)", "var(--primary)"];
const SHAPES: { id: ShapeKind; label: string; Icon: typeof Circle }[] = [
  { id: "line", label: "Line", Icon: Minus }, { id: "arrow", label: "Arrow", Icon: ArrowUpRight }, { id: "ellipse", label: "Circle", Icon: Circle },
  { id: "rect", label: "Rectangle", Icon: Square }, { id: "triangle", label: "Triangle", Icon: Triangle }, { id: "diamond", label: "Diamond", Icon: Diamond },
];

type Gesture =
  | { type: "draw"; page: number; el: DrawEl }
  | { type: "erase"; page: number; els: DrawEl[]; area: boolean }
  | { type: "marquee"; page: number; start: Pt; end: Pt }
  | { type: "move"; page: number; start: Pt; orig: DrawEl[] }
  | { type: "resize"; page: number; box: Box; orig: DrawEl[]; start: Pt }
  | { type: "scroll"; lastY: number };

function Ink({ el, selected }: { el: DrawEl; selected?: boolean }) {
  const common = { stroke: el.color, strokeWidth: el.size, strokeOpacity: el.opacity, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glow = selected ? <path d={el.kind === "stroke" ? strokePath(el.points) : strokePath(shapeOutline(el))} stroke="var(--primary)" strokeOpacity={0.35} strokeWidth={el.size + 8} fill="none" strokeLinecap="round" /> : null;
  if (el.kind === "stroke") return <g>{glow}<path d={strokePath(el.points)} {...common} style={el.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined} /></g>;
  if (el.shape === "ellipse") {
    const cx = (el.a[0] + el.b[0]) / 2, cy = (el.a[1] + el.b[1]) / 2;
    return <g>{glow}<ellipse cx={cx} cy={cy} rx={Math.abs(el.b[0] - el.a[0]) / 2} ry={Math.abs(el.b[1] - el.a[1]) / 2} {...common} /></g>;
  }
  if (el.shape === "arrow") {
    const [x1, y1] = el.a, [x2, y2] = el.b, ang = Math.atan2(y2 - y1, x2 - x1), h = 14 + el.size * 2.5;
    const p1: Pt = [x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45)], p2: Pt = [x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45)];
    return <g>{glow}<path d={`M${x1} ${y1} L${x2} ${y2} M${p1[0]} ${p1[1]} L${x2} ${y2} L${p2[0]} ${p2[1]}`} {...common} /></g>;
  }
  const pts = shapeOutline(el);
  return <g>{glow}<path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ")} {...common} /></g>;
}

export function NoteDrawingCanvas({ value, onChange }: { value: Drawing; onChange: (d: Drawing) => void }) {
  const [drawing, setDrawing] = useState(value);
  const past = useRef<Drawing[]>([]);
  const future = useRef<Drawing[]>([]);
  const [, force] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(INKS[0]);
  const [hlColor, setHlColor] = useState(HIGHLIGHTS[0]);
  const [size, setSize] = useState(3);
  const [hlSize, setHlSize] = useState(18);
  const [opacity, setOpacity] = useState(1);
  const [fingerDraws, setFingerDraws] = useState(true);
  const [selection, setSelection] = useState<{ page: number; ids: string[] } | null>(null);
  const [preview, setPreview] = useState<{ page: number; els: DrawEl[]; extra?: DrawEl; marquee?: Box } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const svgs = useRef<(SVGSVGElement | null)[]>([]);
  const penSeen = useRef(false);

  const commit = useCallback((next: Drawing) => {
    past.current.push(drawing); if (past.current.length > 100) past.current.shift();
    future.current = []; setDrawing(next); onChange(next);
  }, [drawing, onChange]);
  const setPageEls = (page: number, els: DrawEl[]) => commit({ ...drawing, pages: drawing.pages.map((p, i) => i === page ? { ...p, elements: els } : p) });
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(drawing); setDrawing(prev); onChange(prev); setSelection(null); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(drawing); setDrawing(next); onChange(next); setSelection(null); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selection) { e.preventDefault(); deleteSelection(); }
      else if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });

  const toPage = (page: number, e: RPointerEvent): Pt => {
    const svg = svgs.current[page]; const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
  };
  const selectedEls = selection ? drawing.pages[selection.page]?.elements.filter(el => selection.ids.includes(el.id)) ?? [] : [];
  const selBox = unionBox(selectedEls);

  const down = (page: number) => (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "pen") { penSeen.current = true; }
    const isFinger = e.pointerType === "touch";
    // Fingers scroll instead of drawing when finger drawing is off, or once a stylus is in use (palm rejection).
    if (isFinger && (!fingerDraws || penSeen.current) && tool !== "select") { gesture.current = { type: "scroll", lastY: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    if (e.button > 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPage(page, e);
    const els = drawing.pages[page].elements;
    if (tool === "select") {
      if (selection?.page === page && selBox) {
        const hx = selBox.x + selBox.w, hy = selBox.y + selBox.h;
        if (Math.hypot(p[0] - hx, p[1] - hy) < 28) { gesture.current = { type: "resize", page, box: selBox, orig: selectedEls, start: p }; return; }
        if (p[0] >= selBox.x && p[0] <= hx && p[1] >= selBox.y && p[1] <= hy) { gesture.current = { type: "move", page, start: p, orig: selectedEls }; return; }
      }
      const hit = [...els].reverse().find(el => hitTest(el, p, 10));
      if (hit) { setSelection({ page, ids: [hit.id] }); gesture.current = { type: "move", page, start: p, orig: [hit] }; return; }
      setSelection(null); gesture.current = { type: "marquee", page, start: p, end: p }; return;
    }
    setSelection(null);
    if (tool === "eraser" || tool === "area") {
      const next = tool === "area" ? eraseArea(els, p, 14) : els.filter(el => !hitTest(el, p, 8));
      gesture.current = { type: "erase", page, els: next, area: tool === "area" }; setPreview({ page, els: next }); return;
    }
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? 0.6 + e.pressure * 0.8 : 1;
    const el: DrawEl = tool === "pen" || tool === "highlighter"
      ? { id: uid(), kind: "stroke", tool, points: [p], color: tool === "pen" ? color : hlColor, size: tool === "pen" ? size * pressure : hlSize, opacity: tool === "pen" ? opacity : 0.35 } satisfies StrokeEl
      : { id: uid(), kind: "shape", shape: tool, a: p, b: p, color, size, opacity } satisfies ShapeEl;
    gesture.current = { type: "draw", page, el }; setPreview({ page, els, extra: el });
  };

  const move = (page: number) => (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    if (g.type === "scroll") { window.scrollBy(0, g.lastY - e.clientY); document.querySelector("main")?.scrollBy(0, g.lastY - e.clientY); g.lastY = e.clientY; return; }
    if (g.page !== page) return;
    const p = toPage(page, e);
    const els = drawing.pages[page].elements;
    if (g.type === "draw") {
      if (g.el.kind === "stroke") {
        const pts = (e.nativeEvent.getCoalescedEvents?.() ?? []).map(ce => toPage(page, ce as unknown as RPointerEvent));
        const last = g.el.points[g.el.points.length - 1];
        for (const q of pts.length ? pts : [p]) if (Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.8) g.el.points.push(q);
        g.el = { ...g.el, points: [...g.el.points] };
      } else {
        let b = p;
        if (e.shiftKey && g.el.shape !== "line" && g.el.shape !== "arrow") { const d = Math.max(Math.abs(p[0] - g.el.a[0]), Math.abs(p[1] - g.el.a[1])); b = [g.el.a[0] + Math.sign(p[0] - g.el.a[0]) * d, g.el.a[1] + Math.sign(p[1] - g.el.a[1]) * d]; }
        g.el = { ...g.el, b };
      }
      setPreview({ page, els, extra: g.el });
    } else if (g.type === "erase") {
      g.els = g.area ? eraseArea(g.els, p, 14) : g.els.filter(el => !hitTest(el, p, 8)); setPreview({ page, els: g.els });
    } else if (g.type === "marquee") {
      g.end = p; const box = { x: Math.min(g.start[0], p[0]), y: Math.min(g.start[1], p[1]), w: Math.abs(p[0] - g.start[0]), h: Math.abs(p[1] - g.start[1]) };
      setPreview({ page, els, marquee: box });
    } else if (g.type === "move") {
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
      const moved = new Map(g.orig.map(el => [el.id, transformEl(el, ([x, y]) => [x + dx, y + dy])]));
      setPreview({ page, els: els.map(el => moved.get(el.id) ?? el) });
    } else if (g.type === "resize") {
      const sx = Math.max(0.1, (p[0] - g.box.x) / Math.max(1, g.start[0] - g.box.x));
      const sy = Math.max(0.1, (p[1] - g.box.y) / Math.max(1, g.start[1] - g.box.y));
      const s = e.shiftKey ? Math.min(sx, sy) : 0; const fx = s || sx, fy = s || sy;
      const scaled = new Map(g.orig.map(el => [el.id, transformEl(el, ([x, y]) => [g.box.x + (x - g.box.x) * fx, g.box.y + (y - g.box.y) * fy], Math.sqrt(fx * fy))]));
      setPreview({ page, els: els.map(el => scaled.get(el.id) ?? el) });
    }
  };

  const up = () => {
    const g = gesture.current; gesture.current = null;
    if (!g || g.type === "scroll") return;
    const els = drawing.pages[g.page].elements;
    if (g.type === "draw") {
      const el = g.el;
      const tiny = el.kind === "shape" && Math.hypot(el.b[0] - el.a[0], el.b[1] - el.a[1]) < 4;
      if (!tiny) setPageEls(g.page, [...els, el]);
    } else if (g.type === "erase") { if (g.els.length !== els.length || g.area) setPageEls(g.page, g.els); }
    else if (g.type === "marquee") {
      const box = { x: Math.min(g.start[0], g.end[0]), y: Math.min(g.start[1], g.end[1]), w: Math.abs(g.end[0] - g.start[0]), h: Math.abs(g.end[1] - g.start[1]) };
      const ids = box.w + box.h > 6 ? els.filter(el => boxesTouch(bounds(el), box)).map(el => el.id) : [];
      setSelection(ids.length ? { page: g.page, ids } : null);
    } else if ((g.type === "move" || g.type === "resize") && preview) setPageEls(g.page, preview.els);
    setPreview(null);
  };

  const deleteSelection = () => {
    if (!selection) return;
    setPageEls(selection.page, drawing.pages[selection.page].elements.filter(el => !selection.ids.includes(el.id))); setSelection(null);
  };
  const cleanUp = () => {
    if (!selection) return;
    const strokes = selectedEls.filter((el): el is StrokeEl => el.kind === "stroke");
    const shape = recognize(strokes);
    if (!shape) return;
    const ids = new Set(strokes.map(s => s.id));
    setPageEls(selection.page, [...drawing.pages[selection.page].elements.filter(el => !ids.has(el.id)), shape]);
    setSelection({ page: selection.page, ids: [shape.id] });
  };
  const addPage = () => commit({ ...drawing, pages: [...drawing.pages, newPage()] });
  const removePage = (i: number) => {
    if (drawing.pages.length < 2) { setPageEls(0, []); return; }
    if (drawing.pages[i].elements.length && !window.confirm(`Delete page ${i + 1} and everything on it?`)) return;
    commit({ ...drawing, pages: drawing.pages.filter((_, j) => j !== i) }); setSelection(null);
  };

  const ToolBtn = ({ id, label, Icon }: { id: Tool; label: string; Icon: typeof Circle }) =>
    <Button type="button" size="icon" variant={tool === id ? "default" : "ghost"} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => { setTool(id); if (id !== "select") setSelection(null); }} className="size-9 shrink-0"><Icon className="size-4" /></Button>;
  const canClean = selectedEls.some(el => el.kind === "stroke");
  const sep = <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;

  return <div>
    <div className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card/95 px-2 py-2 backdrop-blur" role="toolbar" aria-label="Drawing tools">
      <ToolBtn id="select" label="Select and move" Icon={MousePointer2} />
      <ToolBtn id="pen" label="Pen" Icon={PenLine} />
      <ToolBtn id="highlighter" label="Highlighter" Icon={Highlighter} />
      <ToolBtn id="eraser" label="Stroke eraser" Icon={Eraser} />
      <ToolBtn id="area" label="Area eraser" Icon={Scissors} />
      {sep}
      {SHAPES.map(s => <ToolBtn key={s.id} id={s.id} label={s.label} Icon={s.Icon} />)}
      {sep}
      {(tool === "highlighter" ? HIGHLIGHTS : INKS).map(c => <button key={c} type="button" aria-label="Ink color" onClick={() => tool === "highlighter" ? setHlColor(c) : setColor(c)} className={cn("size-6 shrink-0 rounded-full border-2", (tool === "highlighter" ? hlColor : color) === c ? "border-ring" : "border-transparent")} style={{ background: c }} />)}
      {sep}
      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">Size
        <input type="range" min={tool === "highlighter" ? 8 : 1} max={tool === "highlighter" ? 40 : 16} value={tool === "highlighter" ? hlSize : size} onChange={e => tool === "highlighter" ? setHlSize(+e.target.value) : setSize(+e.target.value)} className="w-20 accent-primary" aria-label="Stroke thickness" />
      </label>
      {tool !== "highlighter" && <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">Opacity
        <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={e => setOpacity(+e.target.value)} className="w-16 accent-primary" aria-label="Opacity" />
      </label>}
      {sep}
      <Button type="button" size="icon" variant="ghost" aria-label="Undo" title="Undo" onClick={undo} disabled={!past.current.length} className="size-9 shrink-0"><Undo2 className="size-4" /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label="Redo" title="Redo" onClick={redo} disabled={!future.current.length} className="size-9 shrink-0"><Redo2 className="size-4" /></Button>
      <Button type="button" size="sm" variant={fingerDraws ? "ghost" : "secondary"} aria-pressed={!fingerDraws} title="When on, your finger scrolls and only a stylus or mouse draws" onClick={() => { setFingerDraws(f => !f); penSeen.current = false; force(n => n + 1); }} className="shrink-0"><Hand className="size-4" />{fingerDraws ? "Finger draws" : "Finger scrolls"}</Button>
    </div>
    {selection && <div className="sticky top-[53px] z-10 flex flex-wrap items-center gap-2 border-b border-border bg-accent/60 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{selection.ids.length} selected — drag to move, corner to resize</span>
      <Button size="sm" variant="secondary" onClick={cleanUp} disabled={!canClean} title="Turn a rough circle, box, line, arrow or triangle into a clean shape"><Sparkles className="size-4" />Clean up shape</Button>
      <Button size="sm" variant="outline" onClick={deleteSelection}><Trash2 className="size-4" />Delete</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelection(null)}><X className="size-4" />Clear selection</Button>
    </div>}
    <div className="flex flex-col items-center gap-6 bg-muted/40 p-3 sm:p-6">
      {drawing.pages.map((page, i) => {
        const p = preview?.page === i ? preview : null;
        const els = p ? p.els : page.elements;
        const sel = selection?.page === i ? selBox && (p ? unionBox(els.filter(el => selection.ids.includes(el.id))) : selBox) : null;
        return <div key={page.id} className="w-full max-w-3xl">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground"><span>Page {i + 1}</span><button type="button" onClick={() => removePage(i)} className="hover:text-destructive" aria-label={`Delete page ${i + 1}`}>{drawing.pages.length > 1 ? "Delete page" : "Clear page"}</button></div>
          <svg ref={el => { svgs.current[i] = el; }} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} aria-label={`Drawing page ${i + 1}`} role="img"
            className={cn("block w-full rounded-lg bg-card shadow-card select-none", tool === "select" ? "cursor-default" : "cursor-crosshair")}
            style={{ touchAction: "none", aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
            onPointerDown={down(i)} onPointerMove={move(i)} onPointerUp={up} onPointerCancel={up}>
            <defs><pattern id={`lines-${page.id}`} width={PAGE_W} height={40} patternUnits="userSpaceOnUse"><line x1={0} y1={39.5} x2={PAGE_W} y2={39.5} stroke="var(--border)" strokeWidth={1} /></pattern></defs>
            <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill={`url(#lines-${page.id})`} />
            <line x1={90} y1={0} x2={90} y2={PAGE_H} stroke="var(--destructive)" strokeOpacity={0.25} strokeWidth={1.5} />
            {els.map(el => <Ink key={el.id} el={el} selected={selection?.page === i && selection.ids.includes(el.id)} />)}
            {p?.extra && <Ink el={p.extra} />}
            {p?.marquee && <rect {...p.marquee} fill="var(--primary)" fillOpacity={0.08} stroke="var(--primary)" strokeDasharray="6 4" />}
            {sel && <g pointerEvents="none"><rect x={sel.x - 6} y={sel.y - 6} width={sel.w + 12} height={sel.h + 12} fill="none" stroke="var(--primary)" strokeDasharray="6 4" strokeWidth={1.5} /><circle cx={sel.x + sel.w} cy={sel.y + sel.h} r={10} fill="var(--primary)" stroke="var(--card)" strokeWidth={3} /></g>}
          </svg>
        </div>;
      })}
      <Button type="button" variant="outline" onClick={addPage}><Plus className="size-4" />Add page</Button>
    </div>
  </div>;
}
