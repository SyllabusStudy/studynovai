// Drawing model for Personal Notes. Kept plain JSON so future tools (AI diagrams,
// flowcharts, mind maps) can append elements with `source: "ai"` without schema changes.
export type Pt = [number, number];
export type ShapeKind = "line" | "arrow" | "ellipse" | "rect" | "triangle" | "diamond";
export type StrokeEl = { id: string; kind: "stroke"; tool: "pen" | "highlighter"; points: Pt[]; color: string; size: number; opacity: number; source?: "user" | "ai" };
export type ShapeEl = { id: string; kind: "shape"; shape: ShapeKind; a: Pt; b: Pt; color: string; size: number; opacity: number; source?: "user" | "ai" };
export type DrawEl = StrokeEl | ShapeEl;
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
    if (el.kind === "shape") continue;
    let run: Pt[] = [];
    const flush = () => { if (run.length > 1) out.push({ ...el, id: uid(), points: run }); run = []; };
    for (const q of el.points) { if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= r + el.size / 2) flush(); else run.push(q); }
    flush();
  }
  return out;
}

export function transformEl(el: DrawEl, f: (p: Pt) => Pt, scale = 1): DrawEl {
  const size = Math.max(1, el.size * scale);
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
export function recognize(strokes: StrokeEl[]): ShapeEl | null {
  if (!strokes.length) return null;
  const base = { id: uid(), kind: "shape" as const, color: strokes[0].color, size: strokes[0].size, opacity: strokes[0].opacity };
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
      return { ...base, shape: "arrow", a: atStart ? end : start, b: atStart ? start : end };
    }
    if (simple.length >= 4) {
      // Shaft then a hooked head: shaft is the longest segment.
      let best = 0, bi = 0;
      for (let i = 1; i < simple.length; i++) { const l = Math.hypot(simple[i]![0] - simple[i - 1]![0], simple[i]![1] - simple[i - 1]![1]); if (l > best) { best = l; bi = i; } }
      if (best > diag * 0.55) return { ...base, shape: "arrow", a: simple[bi - 1]!, b: simple[bi]! };
    }
    return { ...base, shape: "line", a: start, b: end };
  }
  const corners = rdp(main, diag * 0.09);
  const n = corners.length - 1; // closed path repeats start
  const a: Pt = [box.x + base.size / 2, box.y + base.size / 2], b: Pt = [box.x + box.w - base.size / 2, box.y + box.h - base.size / 2];
  if (n === 3) return { ...base, shape: "triangle", a, b };
  if (n === 4 || n === 5) {
    // Diamond if corners sit at edge midpoints rather than box corners.
    const cx = (a[0] + b[0]) / 2;
    const midHits = corners.filter(c => Math.abs(c[0] - cx) < box.w * 0.2).length;
    return { ...base, shape: midHits >= 2 ? "diamond" : "rect", a, b };
  }
  return { ...base, shape: "ellipse", a, b };
}
