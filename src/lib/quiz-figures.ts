/** Browser-only: collects page/photo images from class uploads so quizzes can use real diagrams. */
import { supabase } from "@/integrations/supabase/client";
import type { DocumentRow } from "@/lib/data";

export type QuizPage = { dataUrl: string; width: number; height: number };
export type FigureRef = { page: number; box: [number, number, number, number] };

const MAX_PAGES = 10;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function shrink(src: string, maxW = 1100): Promise<QuizPage> {
  const img = await loadImage(src);
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", 0.72), width: c.width, height: c.height };
}

export async function collectQuizPages(docs: DocumentRow[]): Promise<QuizPage[]> {
  const out: QuizPage[] = [];
  for (const d of docs.slice(0, 4)) {
    if (out.length >= MAX_PAGES) break;
    const type = (d.file_type ?? "").toLowerCase();
    const name = (d.storage_path ?? "").toLowerCase();
    const isPdf = type.includes("pdf") || name.endsWith(".pdf");
    const isImg = type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name);
    if (!isPdf && !isImg) continue;
    try {
      const { data } = await supabase.storage.from("course-materials").download(d.storage_path);
      if (!data) continue;
      if (isPdf) {
        const { renderPdfPages } = await import("@/lib/pdf-render");
        const pages = await renderPdfPages(data, MAX_PAGES - out.length, 1.2);
        for (const p of pages) out.push(await shrink(p.dataUrl));
      } else {
        const url = URL.createObjectURL(data);
        out.push(await shrink(url));
        URL.revokeObjectURL(url);
      }
    } catch {
      /* skip unreadable file */
    }
  }
  return out;
}

/** Crops a normalized [x,y,w,h] box out of a page image. */
export async function cropFigure(page: QuizPage, box: FigureRef["box"]): Promise<string> {
  const img = await loadImage(page.dataUrl);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const [x, y, w, h] = box.map(clamp) as [number, number, number, number];
  const pad = 0.01;
  const sx = Math.max(0, x - pad) * img.width;
  const sy = Math.max(0, y - pad) * img.height;
  const sw = Math.max(0.05, Math.min(1 - x + pad, w + pad * 2)) * img.width;
  const sh = Math.max(0.05, Math.min(1 - y + pad, h + pad * 2)) * img.height;
  const scale = Math.min(1, 420 / sw);
  const c = document.createElement("canvas");
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
