import { supabase } from "@/integrations/supabase/client";
import { prepareLectureAudio } from "@/lib/lecture-audio";

type Transcribe = (a: { data: { path: string; mimeType: string; index: number; total: number } }) => Promise<{ text: string }>;

/** Turns a recorded lecture into one transcript using the same storage-first, piece-by-piece pipeline as Lecture Notes. */
export async function transcribeRecording(userId: string, blob: Blob, transcribe: Transcribe, onStage: (s: string) => void): Promise<string> {
  onStage("Cleaning up the audio…");
  const pieces = await prepareLectureAudio(blob);
  const total = pieces.length;
  const texts: (string | null)[] = new Array(total).fill(null);
  const batch = crypto.randomUUID();
  const fatal = (e: unknown) => e instanceof Error && /free limit|API key|did not allow/i.test(e.message);
  let done = 0, lastProblem = "";
  const run = async (i: number) => {
    const path = `${userId}/lecture-audio/${batch}-${i}.wav`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const up = await supabase.storage.from("course-materials").upload(path, pieces[i]!.blob, { contentType: pieces[i]!.mimeType, upsert: true });
        if (up.error) throw new Error(up.error.message);
        texts[i] = (await transcribe({ data: { path, mimeType: pieces[i]!.mimeType, index: i, total } })).text ?? "";
        done++; onStage(`Listening… ${done} of ${total} part${total > 1 ? "s" : ""} done`);
        return;
      } catch (e) {
        if (fatal(e)) throw e;
        lastProblem = e instanceof Error ? e.message : "";
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
      }
    }
    void supabase.storage.from("course-materials").remove([path]);
  };
  onStage(`Listening… 0 of ${total} part${total > 1 ? "s" : ""} done`);
  await run(0);
  let next = 1;
  const worker = async () => { while (next < total) await run(next++); };
  await Promise.all([worker(), worker()]);
  const transcript = texts.filter(Boolean).join("\n\n").trim();
  if (!transcript) throw new Error(texts.every(t => t === null) ? (lastProblem && !/trouble connecting|failed to fetch|network/i.test(lastProblem) ? lastProblem : "I’m having trouble connecting right now. Your recording is kept — tap Process Lecture again.") : "We couldn't hear any speech in that recording.");
  return transcript;
}

/** Minimal Markdown → HTML for inserting AI output into the Tiptap note. */
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>").replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  const stack: { type: "ul" | "ol"; indent: number }[] = [];
  const closeLists = (toIndent = -1) => { while (stack.length && stack[stack.length - 1]!.indent > toIndent) out.push(`</li></${stack.pop()!.type}>`); };
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\t/g, "    ").trimEnd();
    if (/^\s*```/.test(line)) {
      closeLists(); const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i]!);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      closeLists(); const head = cells(line); i++;
      const rows: string[][] = [];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1]!)) rows.push(cells(lines[++i]!));
      out.push(`<table><tbody><tr>${head.map(c => `<th><p>${inline(c)}</p></th>`).join("")}</tr>${rows.map(r => `<tr>${head.map((_, k) => `<td><p>${inline(r[k] ?? "")}</p></td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    const li = line.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
    if (h) { closeLists(); const n = Math.min(h[1]!.length, 3); out.push(`<h${n}>${inline(h[2]!)}</h${n}>`); }
    else if (li) {
      const indent = li[1]!.length, type = /\d/.test(li[2]!) ? "ol" : "ul";
      const top = stack[stack.length - 1];
      if (!top || indent > top.indent) { out.push(`<${type}><li>`); stack.push({ type, indent }); }
      else {
        closeLists(indent);
        const cur = stack[stack.length - 1];
        if (cur && cur.type === type) out.push("</li><li>");
        else { if (cur) out.push(`</li></${stack.pop()!.type}>`); out.push(`<${type}><li>`); stack.push({ type, indent }); }
      }
      out.push(`<p>${inline(li[3]!)}</p>`);
    }
    else if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { closeLists(); out.push("<hr>"); }
    else if (/^\s*>/.test(line)) { closeLists(); out.push(`<blockquote><p>${inline(line.replace(/^\s*>\s?/, ""))}</p></blockquote>`); }
    else if (!line.trim()) { if (!stack.length || !/^\s*([-*+•]|\d+[.)])\s+/.test(lines[i + 1] ?? "")) closeLists(); }
    else if (stack.length && /^\s{2,}/.test(line)) out.push(`<p>${inline(line.trim())}</p>`);
    else { closeLists(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeLists();
  return out.join("");
}
