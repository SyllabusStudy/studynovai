const STOP = new Set("a an the and or but of to in on for with is are was were be been what whats what's how why who when where which does do did mean means meaning explain define definition tell me about this that it its can you please give make shorter longer simpler more less i my our your".split(" "));

export function topicWords(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []));
}

/** Index of the note block that best matches the question's topic, or -1 when nothing matches. */
export function bestTopicBlock(blocks: string[], query: string): number {
  const words = topicWords(query);
  if (!words.length) return -1;
  let best = -1, bestScore = 0;
  blocks.forEach((b, i) => {
    const text = b.toLowerCase();
    if (text.includes("✨")) return; // skip earlier AI inserts
    const score = words.reduce((s, w) => s + (new RegExp(`\\b${w}`).test(text) ? 1 : 0), 0);
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}
