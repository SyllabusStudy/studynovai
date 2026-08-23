/**
 * Browser-only helper: renders PDF pages to PNG data URLs so the AI can mark
 * boxes on them and we can draw those boxes on top of the page.
 */
export type RenderedPage = { page: number; dataUrl: string; width: number; height: number };

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Renders the first `maxPages` pages of a PDF (File, Blob or URL) to images. */
export async function renderPdfPages(
  source: File | Blob | string,
  maxPages = 3,
  scale = 1.6,
): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfjs();
  const data =
    typeof source === "string"
      ? new Uint8Array(await (await fetch(source)).arrayBuffer())
      : new Uint8Array(await source.arrayBuffer());

  const pdf = await pdfjs.getDocument({ data }).promise;
  const out: RenderedPage[] = [];
  const count = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push({
      page: i,
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return out;
}
