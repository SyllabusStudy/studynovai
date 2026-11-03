// Drawing model for Personal Notes. Kept plain JSON so future tools (AI diagrams,
// flowcharts, mind maps) can append elements with `source: "ai"` without schema changes.
export type Pt = [number, number];
export type ShapeKind = "line" | "arrow" | "ellipse" | "rect" | "triangle" | "diamond";
export type StrokeEl = { id: string; kind: "stroke"; tool: "pen" | "highlighter"; points: Pt[]; color: string; size: number; opacity: number; source?: "user" | "ai" };
export type ShapeEl = { id: string; kind: "shape"; shape: ShapeKind; a: Pt; b: Pt; color: string; size: number; opacity: number; fill?: string; radius?: number; source?: "user" | "ai" };
export type TextEl = { id: string; kind: "text"; at: Pt; text: string; color: string; size: number; opacity: number; source?: "user" | "ai" };
export type DrawEl = StrokeEl | ShapeEl | TextEl;
export type DrawPage = { id: string; elements: DrawEl[] };
export type Drawing = { version: 1; pages: DrawPage[] };

export const PAGE_W = 1000;
export const PAGE_H = 1300;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const newPage = (): DrawPage => ({ id: uid(), elements: [] });

export function normalizeDrawing(raw: unknown): Drawing {
  const r = raw as Partial<Drawing> | null;
  const pages = Array.isArray(r?.pages) ? r!.pages.filter(p => p && Array.isArray(p.elements)) : [];
  return { version: 1, pages: pages.length ? pages : [newPage()] };
}

export type Box = { x: number; y: number; w: number; h: number };
export function bounds(el: DrawEl): Box {
  if (el.kind === "text") { const lines = el.text.split("\n"); const w = Math.max(...lines.map(l => l.length)) * el.size * 0.55; return { x: el.at[0] - w / 2, y: el.at[1] - el.size * 0.8, w, h: el.size * (0.1 + 1.2 * lines.length) }; }
  const pts = el.kind === "stroke" ? el.points : [el.a, el.b];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
  const pad = el.size / 2;
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}
export function unionBox(els: DrawEl[]): Box | null {
  if (!els.length) return null;
  const bs = els.map(bounds);
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y };
}
export const boxesTouch = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function shapeOutline(el: ShapeEl): Pt[] {
  const [x1, y1] = el.a, [x2, y2] = el.b;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  switch (el.shape) {
    case "line": case "arrow": return [el.a, el.b];
    case "rect": return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
    case "triangle": return [[cx, y1], [x2, y2], [x1, y2], [cx, y1]];
    case "diamond": return [[cx, y1], [x2, cy], [cx, y2], [x1, cy], [cx, y1]];
    case "ellipse": return Array.from({ length: 41 }, (_, i) => { const t = (i / 40) * Math.PI * 2; return [cx + Math.cos(t) * Math.abs(x2 - x1) / 2, cy + Math.sin(t) * Math.abs(y2 - y1) / 2] as Pt; });
  }
}
export function hitTest(el: DrawEl, p: Pt, tol: number) {
  if (el.kind === "text") { const b = bounds(el); return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol; }
  const pts = el.kind === "stroke" ? el.points : shapeOutline(el);
  const t = tol + el.size / 2;
  if (pts.length === 1) return Math.hypot(p[0] - pts[0]![0], p[1] - pts[0]![1]) <= t;
  for (let i = 1; i < pts.length; i++) if (distSeg(p, pts[i - 1]!, pts[i]!) <= t) return true;
  return false;
}

/** Area eraser: removes points near p from strokes, splitting them. Shapes are removed if touched. */
export function eraseArea(els: DrawEl[], p: Pt, r: number): DrawEl[] {
  const out: DrawEl[] = [];
  for (const el of els) {
    if (!hitTest(el, p, r)) { out.push(el); continue; }
    if (el.kind !== "stroke") continue;
    let run: Pt[] = [];
    const flush = () => { if (run.length > 1) out.push({ ...el, id: uid(), points: run }); run = []; };
    for (const q of el.points) { if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= r + el.size / 2) flush(); else run.push(q); }
    flush();
  }
  return out;
}

export function transformEl(el: DrawEl, f: (p: Pt) => Pt, scale = 1): DrawEl {
  const size = Math.max(1, el.size * scale);
  if (el.kind === "text") return { ...el, size, at: f(el.at) };
  return el.kind === "stroke" ? { ...el, size, points: el.points.map(f) } : { ...el, size, a: f(el.a), b: f(el.b) };
}

export function strokePath(points: Pt[]) {
  if (!points.length) return "";
  if (points.length === 1) { const [x, y] = points[0]!; return `M${x} ${y} L${x + 0.1} ${y}`; }
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!, [nx, ny] = points[i + 1]!;
    d += ` Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = points[points.length - 1]!;
  return d + ` L${last[0]} ${last[1]}`;
}

// ---- Smart shape cleanup (only runs when the user asks) ----
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distSeg(pts[i]!, pts[0]!, pts[pts.length - 1]!); if (d > max) { max = d; idx = i; } }
  if (max <= eps) return [pts[0]!, pts[pts.length - 1]!];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
const pathLen = (pts: Pt[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) : 0, 0);

/** Turns rough strokes into clean shapes. Returns null when nothing is recognizable. */
export function recognize(strokes: StrokeEl[]): { shape: ShapeEl; used: string[] } | null {
  const r = recognizeShape(strokes);
  return r;
}
function recognizeShape(strokes: StrokeEl[]): { shape: ShapeEl; used: string[] } | null {
  if (!strokes.length) return null;
  const base = { id: uid(), kind: "shape" as const, color: strokes[0]!.color, size: strokes[0]!.size, opacity: strokes[0]!.opacity };
  const sorted = [...strokes].sort((a, b) => pathLen(b.points) - pathLen(a.points));
  const main = sorted[0]!.points;
  if (main.length < 2) return null;
  const box = bounds(sorted[0]!);
  const diag = Math.hypot(box.w, box.h) || 1;
  const start = main[0]!, end = main[main.length - 1]!;
  const closed = Math.hypot(end[0] - start[0], end[1] - start[1]) < diag * 0.22;
  if (!closed) {
    const simple = rdp(main, diag * 0.08);
    // Arrow: either extra short strokes near one end, or a single stroke that hooks back at the end.
    const near = (q: Pt, t: Pt) => Math.hypot(q[0] - t[0], q[1] - t[1]) < diag * 0.3;
    const heads = sorted.slice(1).filter(s => s.points.some(q => near(q, end)) || s.points.some(q => near(q, start)));
    if (heads.length) {
      const atStart = heads[0]!.points.some(q => near(q, start)) && !heads[0]!.points.some(q => near(q, end));
      return { shape: { ...base, shape: "arrow", a: atStart ? end : start, b: atStart ? start : end }, used: [sorted[0]!.id, ...heads.map(h => h.id)] };
    }
    if (simple.length >= 4) {
      // Shaft then a hooked head: shaft is the longest segment.
      let best = 0, bi = 0;
      for (let i = 1; i < simple.length; i++) { const l = Math.hypot(simple[i]![0] - simple[i - 1]![0], simple[i]![1] - simple[i - 1]![1]); if (l > best) { best = l; bi = i; } }
      if (best > diag * 0.55) return { shape: { ...base, shape: "arrow", a: simple[bi - 1]!, b: simple[bi]! }, used: [sorted[0]!.id] };
    }
    return { shape: { ...base, shape: "line", a: start, b: end }, used: [sorted[0]!.id] };
  }
  const corners = rdp(main, diag * 0.09);
  const n = corners.length - 1; // closed path repeats start
  const a: Pt = [box.x + base.size / 2, box.y + base.size / 2], b: Pt = [box.x + box.w - base.size / 2, box.y + box.h - base.size / 2];
  if (n === 3) return { shape: { ...base, shape: "triangle", a, b }, used: [sorted[0]!.id] };
  if (n === 4 || n === 5) {
    // Diamond if corners sit at edge midpoints rather than box corners.
    const cx = (a[0] + b[0]) / 2;
    const midHits = corners.filter(c => Math.abs(c[0] - cx) < box.w * 0.2).length;
    return { shape: { ...base, shape: midHits >= 2 ? "diamond" : "rect", a, b }, used: [sorted[0]!.id] };
  }
  return { shape: { ...base, shape: "ellipse", a, b }, used: [sorted[0]!.id] };
}

/** Wraps a label into short centered lines (max 3) so it fits inside a card. */
export function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= maxChars) lines[lines.length - 1] = last + " " + w;
    else lines.push(w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w);
  }
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2]!.slice(0, maxChars - 1) + "…"; }
  return lines.length ? lines : [""];
}

const PALETTE = ["var(--primary)", "var(--success)", "var(--warning)", "var(--feature-flashcards)", "var(--destructive)"];

/** Lays out an AI diagram (flowchart or mind map) as regular, editable drawing elements. */
export function diagramToElements(d: { title: string; layout: "flow" | "mind"; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] }): DrawEl[] {
  const ink = "var(--foreground)", accent = "var(--primary)";
  type Card = { c: Pt; hw: number; hh: number; color: string; lines: string[]; font: number; center?: boolean };
  const cards = new Map<string, Card>();
  const font = 22, lineH = font * 1.2;
  const make = (id: string, label: string, c: Pt, w: number, color: string, center = false) => {
    const f = center ? 26 : font;
    const lines = wrapLabel(label, Math.max(8, Math.floor((w - 28) / (f * 0.55))));
    cards.set(id, { c, hw: w / 2, hh: Math.max(36, (lines.length * f * 1.2 + 26) / 2), color, lines, font: f, center });
  };
  const n = d.nodes.length;
  if (d.layout === "mind") {
    d.nodes.forEach((node, i) => {
      if (i === 0) { make(node.id, node.label, [PAGE_W / 2, PAGE_H / 2 + 20], 300, accent, true); return; }
      const t = ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2 - Math.PI / 2;
      make(node.id, node.label, [PAGE_W / 2 + Math.cos(t) * 330, PAGE_H / 2 + 20 + Math.sin(t) * 440], 230, PALETTE[(i - 1) % PALETTE.length]!);
    });
  } else {
    // Layered layout: each node sits one row below its deepest parent, so branches read top-to-bottom.
    const level = new Map<string, number>(d.nodes.map(x => [x.id, 0]));
    for (let pass = 0; pass < n; pass++) {
      let moved = false;
      for (const e of d.edges) { const lf = level.get(e.from)!, lt = level.get(e.to)!; if (e.from !== e.to && lt <= lf && lf + 1 < n) { level.set(e.to, lf + 1); moved = true; } }
      if (!moved) break;
    }
    if (!d.edges.length) d.nodes.forEach((x, i) => level.set(x.id, i));
    const rows: string[][] = [];
    for (const x of d.nodes) (rows[level.get(x.id)!] ??= []).push(x.id);
    const filled = rows.filter(Boolean);
    const gap = Math.min(190, (PAGE_H - 260) / Math.max(1, filled.length));
    const label = new Map(d.nodes.map(x => [x.id, x.label]));
    filled.forEach((row, r) => {
      const w = Math.min(300, (PAGE_W - 80) / row.length - 30);
      row.forEach((id, j) => make(id, label.get(id)!, [PAGE_W / 2 + (j - (row.length - 1) / 2) * (w + 30), 210 + r * gap], w, PALETTE[r % PALETTE.length]!));
    });
  }
  const els: DrawEl[] = [{ id: uid(), kind: "text", at: [PAGE_W / 2, 95], text: d.title, color: ink, size: 40, opacity: 1, source: "ai" }];
  const edgeOf = (k: Card, dx: number, dy: number, sgn: number): Pt => {
    const t = Math.min((k.hw + 8) / Math.abs(dx || 1e-6), (k.hh + 8) / Math.abs(dy || 1e-6));
    return [k.c[0] + sgn * dx * t, k.c[1] + sgn * dy * t];
  };
  for (const e of d.edges) {
    const a = cards.get(e.from), b = cards.get(e.to); if (!a || !b || a === b) continue;
    const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1];
    const p = edgeOf(a, dx, dy, 1), q = edgeOf(b, dx, dy, -1);
    els.push({ id: uid(), kind: "shape", shape: d.layout === "mind" ? "line" : "arrow", a: p, b: q, color: d.layout === "mind" ? b.color : "var(--muted-foreground)", size: 3, opacity: 0.9, source: "ai" });
    if (e.label) els.push({ id: uid(), kind: "text", at: [(p[0] + q[0]) / 2 + (Math.abs(dx) < 20 ? 14 : 0), (p[1] + q[1]) / 2 - 6], text: e.label.slice(0, 30), color: "var(--muted-foreground)", size: 17, opacity: 1, source: "ai" });
  }
  for (const k of cards.values()) {
    els.push({ id: uid(), kind: "shape", shape: k.center ? "ellipse" : "rect", a: [k.c[0] - k.hw, k.c[1] - k.hh], b: [k.c[0] + k.hw, k.c[1] + k.hh], color: k.color, size: k.center ? 4 : 2.5, opacity: 1, fill: k.color, radius: 18, source: "ai" });
    const top = k.c[1] - ((k.lines.length - 1) * k.font * 1.2) / 2 + k.font * 0.35;
    els.push({ id: uid(), kind: "text", at: [k.c[0], top], text: k.lines.join("\n"), color: ink, size: k.font, opacity: 1, source: "ai" });
  }
  void lineH;
  return els;
}
