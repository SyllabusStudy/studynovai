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
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { close(); out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`); }
    else if (ul) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li><p>${inline(ul[1]!)}</p></li>`); }
    else if (ol) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li><p>${inline(ol[1]!)}</p></li>`); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join("");
}
