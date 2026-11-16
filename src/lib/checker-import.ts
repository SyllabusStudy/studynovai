/** Browser-only: pull plain text out of an uploaded file for the AI Checker. */
export async function readTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > 15 * 1024 * 1024) throw new Error("That file is too big. Try one under 15 MB.");
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      pages.push(c.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
    }
    return pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
  }
  if (name.endsWith(".docx")) return readDocx(file);
  if (/\.(txt|md|rtf|text)$/.test(name) || file.type.startsWith("text/")) return (await file.text()).trim();
  throw new Error("Use a PDF, Word (.docx) or text file.");
}

async function readDocx(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  // Find document.xml in the zip central directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("That Word file couldn't be read.");
  let p = view.getUint32(eocd + 16, true);
  const total = view.getUint16(eocd + 10, true);
  for (let n = 0; n < total; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nameLen));
    if (fname === "word/document.xml") {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = buf.slice(start, start + size);
      const xmlBytes = method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      const xml = new TextDecoder().decode(xmlBytes);
      return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, "\n\n").trim();
    }
    p += 46 + nameLen + extra + comment;
  }
  throw new Error("That Word file has no text.");
}
