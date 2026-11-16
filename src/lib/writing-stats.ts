/** Pure, local writing metrics shown alongside the AI Checker result. */
export const CLICHES = [
  "delve", "it is important to note", "it's important to note", "it is worth noting", "plays a crucial role",
  "plays a vital role", "plays a pivotal role", "a testament to", "tapestry", "landscape", "foster", "underscore",
  "pivotal", "multifaceted", "seamless", "leverage", "embark", "realm", "showcase", "intricate", "ever-evolving",
  "in today's world", "paving the way", "a myriad of", "holistic", "robust", "shed light", "valuable insights",
  "harness", "transformative", "in conclusion", "moreover", "furthermore", "additionally", "in the digital age",
];

export type WritingStats = {
  sentences: number;
  avgSentenceWords: number;
  /** 0–100: how much sentence lengths vary (higher reads more human). */
  variety: number;
  lengths: number[];
  cliches: { phrase: string; count: number }[];
  readingMinutes: number;
};

export function writingStats(text: string): WritingStats {
  const sents = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
  const lengths = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const n = lengths.length;
  const mean = n ? lengths.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const variety = mean ? Math.round(Math.min(1, sd / mean / 0.6) * 100) : 0;
  const lower = text.toLowerCase();
  const cliches = CLICHES.map((phrase) => {
    const re = new RegExp(`\\b${phrase.replace(/[-']/g, "[-']")}\\b`, "g");
    return { phrase, count: lower.match(re)?.length ?? 0 };
  }).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { sentences: n, avgSentenceWords: Math.round(mean * 10) / 10, variety, lengths, cliches, readingMinutes: Math.max(1, Math.round(words / 230)) };
}
