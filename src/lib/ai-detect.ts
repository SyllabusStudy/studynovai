/**
 * Evidence-based AI-writing analysis. Pure functions (no network) so the
 * pipeline can be unit-tested; the language-model judgement is passed in.
 * This is NOT plagiarism detection — no text matching against sources.
 */

export type Label = "ai" | "human" | "mixed";
export type Confidence = "low" | "medium" | "high";
export type Verdict = "likely_ai" | "possibly_ai" | "likely_human" | "mixed" | "insufficient";

export type Signal = {
  id: string;
  /** Plain-language reason shown to students — only when detected. */
  label: string;
  /** 0 = human-leaning, 1 = AI-leaning. */
  score: number;
  weight: number;
  detected: boolean;
  direction: "ai" | "human";
};

export type SectionResult = {
  index: number;
  start: number; // first sentence index
  end: number; // last sentence index (inclusive)
  words: number;
  aiPercent: number;
  modelPercent: number | null;
  localPercent: number;
  label: Label;
  reasons: string[];
};

export type AiCheckResult = {
  aiPercent: number;
  humanPercent: number;
  verdict: Verdict;
  verdictText: string;
  confidence: Confidence;
  words: number;
  reasons: string[];
  cautions: string[];
  sections: SectionResult[];
  spans: { text: string; label: Label; section: number }[];
  modelPercent: number | null;
  localPercent: number;
};

export const MIN_WORDS = 80;

/** Split text into sentence pieces that concatenate back to the exact original. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*)?\s*|\n+\s*/g) ?? [text];
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && !p.trim()) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.length ? out : [text];
}

const TRANSITIONS = [
  "moreover", "furthermore", "additionally", "in addition", "in conclusion", "overall", "ultimately",
  "consequently", "therefore", "thus", "however", "firstly", "secondly", "lastly", "finally",
  "in summary", "to summarize", "as a result", "on the other hand", "in today's", "notably",
  "importantly", "similarly", "conversely", "nevertheless", "hence",
];
const AI_PHRASES = [
  "delve", "it is important to note", "it's important to note", "it is worth noting", "it's worth noting",
  "plays a crucial role", "plays a vital role", "plays a pivotal role", "a testament to", "tapestry",
  "navigate the", "navigating the", "landscape", "foster", "underscore", "pivotal", "multifaceted",
  "seamless", "leverage", "embark", "realm", "showcase", "intricate", "ever-evolving", "in today's world",
  "paving the way", "a myriad of", "holistic", "robust", "shed light", "serves as a", "not only",
  "valuable insights", "harness", "transformative", "profound", "resonate", "nuanced", "in the digital age",
];
const GENERIC = [
  "various", "significant", "significantly", "essential", "crucial", "enhance", "ensure", "potential",
  "numerous", "key", "valuable", "effectively", "overall", "vital", "diverse", "individuals", "aspects",
  "impact", "approach", "ability", "provide", "providing", "allows", "enables", "benefits", "challenges",
  "opportunities", "important", "role", "unique", "comprehensive", "innovative", "effective",
];
const PERSONAL = /\b(i|me|my|mine|i'm|i've|i'd|i'll|we|our|lol|idk|kinda|gonna|wanna|tbh|honestly|yeah|ok|okay|like,|stuff|dude|mom|dad)\b/g;
const CONTRACTION = /\b\w+'(t|s|re|ve|ll|d|m)\b/g;
const INFORMAL = /(!{2,}|\?{2,}|\.\.\.|\b(dont|cant|wont|im|ive|thats|u|ur|bc|cuz)\b|\s,|\s{2,})/g;

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const wordsOf = (s: string) => s.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
const countHits = (lower: string, list: string[]) =>
  list.reduce((n, ph) => n + (lower.match(new RegExp(`\\b${ph.replace(/[-']/g, "[-']")}`, "g"))?.length ?? 0), 0);

/** Remove quotes, citations, URLs and list bullets so they don't skew signals. */
export function cleanForSignals(s: string) {
  return s
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[“"][^”"]{40,}[”"]/g, " ")
    .replace(/\(([A-Z][A-Za-z&. ]+,? (et al\.,? )?\d{4}[a-z]?(, p+\. ?\d+)?;? ?)+\)/g, " ")
    .replace(/\[\d+(,\s*\d+)*\]/g, " ")
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "");
}

const isListLine = (s: string) => /^\s*([-*•]|\d+[.)])\s+/.test(s);

function cv(nums: number[]) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (!mean) return 0;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  return sd / mean;
}

/** Local, deterministic writing signals for one chunk of sentences. */
export function computeSignals(sentences: string[], paragraphs: string[] = []): Signal[] {
  const prose = sentences.filter((s) => s.trim() && !isListLine(s)).map((s) => cleanForSignals(s).trim()).filter((s) => wordsOf(s).length >= 3);
  const text = prose.join(" ");
  const lower = text.toLowerCase();
  const words = wordsOf(text);
  const n = Math.max(1, words.length);
  const sig: Signal[] = [];
  if (prose.length < 3 || words.length < 30) return sig;

  // 1. Sentence-length distribution / burstiness
  const lens = prose.map((s) => wordsOf(s).length);
  const lenCv = cv(lens);
  const lenScore = clamp((0.62 - lenCv) / 0.4);
  sig.push({
    id: "length", weight: prose.length >= 5 ? 2 : 1, score: lenScore, direction: lenScore >= 0.5 ? "ai" : "human",
    detected: prose.length >= 4 && (lenScore >= 0.6 || lenScore <= 0.1),
    label: lenScore >= 0.6 ? "Low variation in sentence length (very even rhythm)" : "Sentence lengths vary a lot, like natural writing",
  });

  // 2. Sentence-structure uniformity (commas / clause pattern per sentence)
  const commas = prose.map((s) => (s.match(/[,;:]/g)?.length ?? 0) / Math.max(1, wordsOf(s).length) * 10);
  const structCv = cv(commas.map((c) => c + 0.5));
  const structScore = clamp((0.75 - structCv) / 0.5);
  sig.push({
    id: "structure", weight: 1, score: structScore, direction: structScore >= 0.5 ? "ai" : "human",
    detected: prose.length >= 4 && structScore >= 0.65,
    label: "Highly uniform sentence structure",
  });

  // 3. Transitional phrase patterns (at sentence starts)
  const transStarts = prose.filter((s) => TRANSITIONS.some((t) => s.toLowerCase().replace(/^[^a-z]+/, "").startsWith(t))).length;
  const transRate = transStarts / prose.length;
  const transScore = clamp(transRate / 0.3);
  sig.push({
    id: "transitions", weight: 1.5, score: transScore, direction: "ai", detected: transStarts >= 2 && transRate >= 0.15,
    label: `Consistently predictable transitions (${transStarts} sentences open with words like "Moreover" or "Overall")`,
  });

  // 4. Stock AI phrasing
  const phraseHits = countHits(lower, AI_PHRASES);
  const phraseRate = (phraseHits / n) * 1000;
  const phraseScore = clamp(phraseRate / 8);
  sig.push({
    id: "phrases", weight: 2, score: phraseScore, direction: "ai", detected: phraseHits >= 2 && phraseRate >= 3,
    label: `Stock phrasing common in AI text (${phraseHits} found, e.g. "crucial role", "delve", "landscape")`,
  });

  // 5. Predictable / generic vocabulary (a perplexity proxy)
  const genericRate = countHits(lower, GENERIC) / n;
  const genericScore = clamp((genericRate - 0.012) / 0.035);
  sig.push({
    id: "generic", weight: 1.5, score: genericScore, direction: genericScore >= 0.5 ? "ai" : "human",
    detected: genericScore >= 0.6,
    label: "Predictable, generic word choice (e.g. \"significant\", \"essential\", \"various\")",
  });

  // 6. Repetition: repeated sentence openers and 3-word templates
  const openers = prose.map((s) => wordsOf(s).slice(0, 2).join(" "));
  const openerRep = openers.length - new Set(openers).size;
  const grams = new Map<string, number>();
  for (const s of prose) {
    const w = wordsOf(s);
    for (let i = 0; i + 2 < w.length; i++) {
      const g = `${w[i]} ${w[i + 1]} ${w[i + 2]}`;
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
  }
  const repeatedGrams = [...grams.values()].filter((c) => c >= 2).reduce((a, c) => a + c - 1, 0);
  const repScore = clamp((openerRep / prose.length) * 1.5 + (repeatedGrams / n) * 12);
  sig.push({
    id: "repetition", weight: 1, score: repScore, direction: "ai", detected: repScore >= 0.5 && (openerRep >= 2 || repeatedGrams >= 3),
    label: "Repeated phrasing patterns and sentence templates",
  });

  // 7. Vocabulary distribution: long, formal words used evenly
  const wl = words.map((w) => w.length);
  const avgLen = wl.reduce((a, b) => a + b, 0) / n;
  const longShare = wl.filter((l) => l >= 9).length / n;
  const vocabScore = clamp((avgLen - 4.4) / 1.1) * 0.6 + clamp((longShare - 0.08) / 0.12) * 0.4;
  sig.push({
    id: "vocabulary", weight: 0.75, score: vocabScore, direction: vocabScore >= 0.5 ? "ai" : "human",
    detected: vocabScore >= 0.75,
    label: "Polished, formal vocabulary used evenly throughout",
  });

  // 8. Personal voice, contractions, informal markers (human evidence)
  const personal = (lower.match(PERSONAL)?.length ?? 0) / n;
  const contractions = (lower.match(CONTRACTION)?.length ?? 0) / n;
  const informal = text.match(INFORMAL)?.length ?? 0;
  const voice = clamp(personal * 18 + contractions * 12 + informal * 0.08);
  sig.push({
    id: "voice", weight: 2, score: 1 - voice, direction: voice >= 0.35 ? "human" : "ai",
    detected: voice >= 0.35 || voice <= 0.03,
    label: voice >= 0.35 ? "Personal voice, contractions or casual wording (human-leaning)" : "No personal voice, contractions or informal wording",
  });

  // 9. Balanced lists of three ("A, B, and C") — a common generated rhythm
  const triads = text.match(/\b\w+(?: \w+)?, \w+(?: \w+)?,? and \w+/g)?.length ?? 0;
  const triadRate = triads / prose.length;
  sig.push({
    id: "triads", weight: 1, score: clamp(triadRate / 0.35), direction: "ai", detected: triads >= 2 && triadRate >= 0.2,
    label: `Frequent balanced lists of three (${triads} "A, B, and C" patterns)`,
  });

  // 10. Specific detail: numbers, names, concrete nouns (human evidence)
  const specifics = (text.match(/\b\d+(\.\d+)?\b|\b[A-Z][a-z]+ (?:[A-Z][a-z]+|\(\d{4}\))/g)?.length ?? 0) / prose.length;
  const specScore = clamp(1 - specifics / 0.6);
  sig.push({
    id: "specifics", weight: 1, score: specScore, direction: specScore >= 0.5 ? "ai" : "human",
    detected: specScore <= 0.2 || (specScore >= 0.95 && prose.length >= 5),
    label: specScore <= 0.2 ? "Concrete details such as numbers, names or dates (human-leaning)" : "General statements with few concrete details, numbers or names",
  });

  // 11. Paragraph-level consistency
  const paras = paragraphs.map((p) => wordsOf(p).length).filter((l) => l >= 15);
  if (paras.length >= 3) {
    const pScore = clamp((0.45 - cv(paras)) / 0.3);
    sig.push({
      id: "paragraphs", weight: 1, score: pScore, direction: pScore >= 0.5 ? "ai" : "human", detected: pScore >= 0.65,
      label: "Strong stylistic consistency across paragraphs (similar size and shape)",
    });
  }
  return sig;
}

export function localScore(signals: Signal[]) {
  const w = signals.reduce((a, s) => a + s.weight, 0);
  if (!w) return null;
  return Math.round((signals.reduce((a, s) => a + s.score * s.weight, 0) / w) * 100);
}

export function paragraphsOf(text: string) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Group sentence indexes into ~120-word sections. */
export function sectionize(pieces: string[], target = 120) {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  let words = 0;
  pieces.forEach((p, i) => {
    words += wordsOf(p).length;
    const paraBreak = /\n\s*\n\s*$/.test(p);
    if (words >= target || (paraBreak && words >= target * 0.35)) {
      out.push({ start, end: i });
      start = i + 1;
      words = 0;
    }
  });
  if (start < pieces.length) {
    const rest = pieces.slice(start).reduce((a, p) => a + wordsOf(p).length, 0);
    if (out.length && rest < target * 0.4) out[out.length - 1]!.end = pieces.length - 1;
    else out.push({ start, end: pieces.length - 1 });
  }
  return out;
}

export type ModelJudgement = {
  /** sentence index → 0-100 AI probability */
  probs: Record<number, number>;
  genre?: string;
};

const labelFor = (p: number): Label => (p >= 60 ? "ai" : p <= 38 ? "human" : "mixed");

/**
 * Fuse the style score with the model reader. Plain averaging let a lenient
 * model pull clearly AI-styled text down to ~20%, so when several independent
 * style signals agree the style evidence sets a floor (and vice versa).
 */
export function fuse(local: number, model: number | null, signals: Signal[]) {
  if (model === null) return local;
  const aiHits = signals.filter((s) => s.detected && s.direction === "ai").length;
  const humanHits = signals.filter((s) => s.detected && s.direction === "human").length;
  let v = model * 0.55 + local * 0.45;
  if (aiHits >= 3 && local >= 58 && humanHits === 0) v = Math.max(v, local * 0.92, model);
  if (humanHits >= 2 && local <= 42 && aiHits <= 1) v = Math.min(v, Math.max(local, model * 0.7));
  return Math.round(clamp(v / 100) * 100);
}

/** Combine local signals with the model judgement across every section. */
export function combine(text: string, model: ModelJudgement | null): AiCheckResult {
  const pieces = splitSentences(text);
  const totalWords = wordsOf(cleanForSignals(text)).length;
  const docSignals = computeSignals(pieces, paragraphsOf(text));
  const docLocal = localScore(docSignals) ?? 50;
  const sectionRanges = sectionize(pieces);

  const sections: SectionResult[] = sectionRanges.map((r, index) => {
    const sents = pieces.slice(r.start, r.end + 1);
    const sw = wordsOf(sents.join(" ")).length;
    const sig = computeSignals(sents);
    const loc = sw >= 60 ? (localScore(sig) ?? docLocal) : docLocal;
    const ps = sents.map((_, k) => model?.probs[r.start + k]).filter((p): p is number => typeof p === "number");
    const mp = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
    const ai = fuse(loc, mp, sw >= 60 ? sig : docSignals);
    const reasons = sig.filter((s) => s.detected).sort((a, b) => b.score * b.weight - a.score * a.weight).map((s) => s.label);
    if (mp !== null && mp >= 60) reasons.push(`Sentence-by-sentence reading found predictable, AI-like wording (${mp}%)`);
    if (mp !== null && mp <= 38) reasons.push(`Sentence-by-sentence reading found natural, less predictable wording (${mp}% AI-like)`);
    return { index, start: r.start, end: r.end, words: sw, aiPercent: ai, modelPercent: mp, localPercent: loc, label: labelFor(ai), reasons };
  });

  const totalSw = sections.reduce((a, s) => a + s.words, 0) || 1;
  let ai = Math.round(sections.reduce((a, s) => a + s.aiPercent * s.words, 0) / totalSw);
  const allProbs = Object.values(model?.probs ?? {});
  const modelPercent = allProbs.length ? Math.round(allProbs.reduce((a, b) => a + b, 0) / allProbs.length) : null;

  // Style shift across sections — evidence of mixed authorship.
  const cautions: string[] = [];
  const reasons = docSignals.filter((s) => s.detected).map((s) => s.label);
  if (sections.length >= 2) {
    const vals = sections.map((s) => s.aiPercent);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread >= 40) reasons.push("Writing style changes noticeably between sections");
  }

  // Confidence = strength + agreement of evidence (separate from the AI %).
  const docAiHits = docSignals.filter((s) => s.detected && s.direction === "ai").length;
  const docHumanHits = docSignals.filter((s) => s.detected && s.direction === "human").length;
  let level = totalWords >= 250 ? 2 : totalWords >= 120 ? 1 : 0;
  const agree = modelPercent !== null && Math.abs(modelPercent - docLocal) <= 22 && (modelPercent >= 50) === (docLocal >= 50);
  if (agree || (ai >= 60 && docAiHits >= 4 && docHumanHits === 0) || (ai <= 38 && docHumanHits >= 2 && docAiHits <= 1)) level++;
  if (modelPercent === null) level--;
  else if (Math.abs(modelPercent - docLocal) > 35 && !agree) level--;
  if (ai > 42 && ai < 58) level--;
  const genre = (model?.genre ?? "").toLowerCase();
  const sensitive = ["academic", "technical", "esl", "formal", "legal", "list"].find((g) => genre.includes(g));
  if (sensitive && ai >= 50) {
    if (!agree) level--;
    cautions.push(
      sensitive === "esl"
        ? "This may be non-native English writing, which detectors often misjudge as AI."
        : `This looks like ${sensitive} writing. Formal writing naturally shares traits with AI text, so treat this result carefully.`,
    );
  }
  if (/\n\s*([-*•]|\d+[.)])\s+/.test(`\n${text}`)) cautions.push("Lists and bullet points were left out of the style checks.");
  level = Math.max(0, Math.min(2, level));
  const confidence: Confidence = level >= 2 ? "high" : level === 1 ? "medium" : "low";

  const secSpread = sections.length >= 2 ? Math.max(...sections.map((s) => s.aiPercent)) - Math.min(...sections.map((s) => s.aiPercent)) : 0;
  let verdict: Verdict;
  if (totalWords < MIN_WORDS || !docSignals.length) {
    verdict = "insufficient";
  } else if (secSpread >= 40 && sections.some((s) => s.label === "ai") && sections.some((s) => s.label === "human")) verdict = "mixed";
  else if (ai >= 70) verdict = "likely_ai";
  else if (ai >= 55) verdict = "possibly_ai";
  else if (ai <= 35 && confidence !== "low") verdict = "likely_human";
  else if (ai <= 25) verdict = "likely_human";
  else verdict = "mixed";

  const verdictText = {
    likely_ai: "Likely AI-generated",
    possibly_ai: "Possibly AI-generated",
    likely_human: "Likely human-written",
    mixed: "Mixed / Uncertain",
    insufficient: "Unable to determine",
  }[verdict];

  const secOf = (i: number) => sections.find((s) => i >= s.start && i <= s.end)?.index ?? 0;
  const spans = pieces.map((p, i) => {
    const mp = model?.probs[i];
    const sec = sections[secOf(i)];
    const base = sec ? sec.aiPercent : ai;
    const val = typeof mp === "number" ? Math.round(mp * 0.6 + base * 0.4) : base;
    return { text: p, label: verdict === "insufficient" ? ("mixed" as Label) : labelFor(val), section: secOf(i) };
  });

  return {
    aiPercent: ai,
    humanPercent: 100 - ai,
    verdict,
    verdictText,
    confidence: verdict === "insufficient" ? "low" : confidence,
    words: totalWords,
    reasons: [...new Set(reasons)],
    cautions,
    sections,
    spans,
    modelPercent,
    localPercent: docLocal,
  };
}
