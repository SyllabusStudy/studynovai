import { describe, expect, it } from "vitest";
import { combine, computeSignals, isMeaningfullyRewritten, localScore, paragraphsOf, splitSentences, textSimilarity, REWRITE_SIMILARITY_LIMIT } from "./ai-detect";

type Kind = "ai" | "human" | "mixed" | "short";
const S: { name: string; kind: Kind; text: string }[] = [
  {
    name: "AI essay (social media)",
    kind: "ai",
    text: `Social media plays a crucial role in shaping the way individuals communicate in today's digital age. It provides a platform for people to connect, share ideas, and build meaningful relationships across the globe. Moreover, social media has transformed the landscape of marketing, allowing businesses to reach diverse audiences with unprecedented efficiency.

However, it is important to note that social media also presents significant challenges. The spread of misinformation can have a profound impact on public opinion and trust. Additionally, excessive use of social media has been linked to various mental health concerns, including anxiety and depression.

Furthermore, privacy remains a key concern for many users. Personal data is often collected and utilized in ways that individuals may not fully understand. Therefore, it is essential for users to navigate these platforms responsibly and remain aware of the potential risks.

In conclusion, social media is a multifaceted tool that offers numerous benefits while also posing significant challenges. By fostering digital literacy and promoting responsible usage, society can harness its potential while mitigating its negative effects.`,
  },
  {
    name: "AI essay (climate)",
    kind: "ai",
    text: `Climate change is one of the most pressing challenges facing humanity today. Rising global temperatures have led to more frequent and severe weather events, which pose significant risks to communities worldwide. Moreover, the melting of polar ice caps contributes to rising sea levels, threatening coastal regions and ecosystems.

Addressing climate change requires a comprehensive and collaborative approach. Governments play a pivotal role in implementing policies that reduce greenhouse gas emissions. Additionally, businesses can leverage innovative technologies to enhance energy efficiency and promote sustainable practices.

Individuals also have a vital role to play in this effort. Simple actions, such as reducing energy consumption and supporting renewable energy, can have a meaningful impact. Ultimately, a collective commitment to sustainability is essential for ensuring a healthier planet for future generations.`,
  },
  {
    name: "Edited AI (light paraphrase)",
    kind: "ai",
    text: `Remote work has changed the modern workplace in important ways. It gives employees more flexibility and allows companies to hire talent from anywhere. Furthermore, it can reduce costs related to office space and commuting. However, remote work also brings challenges that organizations must address. Communication can become more difficult without face-to-face interaction. Additionally, some employees may struggle with isolation and maintaining a healthy work-life balance. Therefore, it is essential for companies to provide the right tools and support. Overall, remote work offers significant benefits, but it requires careful planning to be effective.`,
  },
  {
    name: "Human casual (weekend)",
    kind: "human",
    text: `ok so this weekend was kind of a mess lol. I was supposed to finish my bio lab report but my roommate's cat got out and we spent like two hours chasing it around the parking lot. Found it under a truck. Obviously.

Then Sunday I finally sat down to write and my laptop decided it needed an update right then... 45 minutes. I ended up writing half of it on my phone which was honestly awful. My TA probably won't care but I'm annoyed. Next time I'm starting Thursday, no excuses. (I say that every week.)`,
  },
  {
    name: "Human reflection",
    kind: "human",
    text: `When I first moved here I didn't know a single person. My dad dropped me off, hugged me way too long, and drove away, and I just stood in the hallway holding a lamp. That first week I ate dinner alone twice. Not great.

What changed it was the stupid intramural volleyball team. I'm terrible at volleyball. We lost every game, one of them 25-4, but after each loss we'd go get tacos and argue about who was the worst. It was me. Anyway, those people are still my closest friends, three years later, and I still can't serve.`,
  },
  {
    name: "Human academic (with citations)",
    kind: "human",
    text: `Our results only partly support the original hypothesis. Seedlings grown under the red filter were taller after 14 days (mean 11.2 cm vs. 8.7 cm), but the difference in leaf count was small and probably not significant with n = 12. One tray was also moved near the window on day 6 by mistake, which could have raised its light exposure. We did not correct for this.

Smith and Lee (2019) reported a much larger effect, though they used a stronger light source and a different cultivar. If we repeat this, I'd increase the sample size, fix the tray positions, and measure chlorophyll directly instead of guessing from leaf color.`,
  },
  {
    name: "Human ESL",
    kind: "human",
    text: `In my country the school is very different from here. We are going to school six days in week and the teacher is always talking and we are writing. Here the teacher ask many question to students and I was surprise at first, I did not know what I must answer. Also here the students are eating in class, in my country is not allowed never.

My first month I was very shy to speak because my English is not so good. But my classmate Ana help me a lot, she explain me the homework and now we are friends. I think now I like more this system, but sometimes I miss my old school and my friends there.`,
  },
  {
    name: "Mixed (human start, AI end)",
    kind: "mixed",
    text: `I honestly didn't want to take statistics. My advisor made me, and the first week I sat in the back and doodled on my notes. Then we did this thing with coin flips where everyone's results got pooled and it kinda blew my mind that it landed so close to 50%. I stayed after to ask about it, which is not like me at all.

Moreover, statistics plays a crucial role in numerous fields, including healthcare, economics, and social sciences. It provides essential tools for analyzing data and making informed decisions. Additionally, a strong understanding of statistical concepts enables individuals to critically evaluate information in today's data-driven world. Ultimately, statistics is a valuable discipline that fosters analytical thinking.`,
  },
  { name: "Short sample", kind: "short", text: `Photosynthesis converts light energy into chemical energy. It plays a crucial role in ecosystems.` },
];

const aiProbsFor = (text: string, pAi: number, pHuman: number, humanUntil = -1) => {
  const pieces = splitSentences(text);
  const probs: Record<number, number> = {};
  pieces.forEach((_, i) => (probs[i] = i <= humanUntil ? pHuman : pAi));
  return probs;
};

describe("local writing signals", () => {
  const rows = S.filter((s) => s.kind !== "short").map((s) => {
    const sig = computeSignals(splitSentences(s.text), paragraphsOf(s.text));
    return { name: s.name, kind: s.kind, local: localScore(sig) ?? -1 };
  });
  console.table(rows);

  it("scores every AI sample above every human sample", () => {
    const ai = rows.filter((r) => r.kind === "ai").map((r) => r.local);
    const human = rows.filter((r) => r.kind === "human").map((r) => r.local);
    expect(Math.min(...ai)).toBeGreaterThan(Math.max(...human));
  });

  it("has no false positives or negatives at the 50 line", () => {
    const fp = rows.filter((r) => r.kind === "human" && r.local >= 50).map((r) => r.name);
    const fn = rows.filter((r) => r.kind === "ai" && r.local < 50).map((r) => r.name);
    console.log("local false positives:", fp, "false negatives:", fn);
    expect(fp).toEqual([]);
    expect(fn).toEqual([]);
  });
});

describe("combined pipeline", () => {
  it("does not let a lenient model reader clear obvious AI text", () => {
    const t = S[0]!.text;
    const r = combine(t, { probs: aiProbsFor(t, 35, 35), genre: "formal" });
    expect(r.aiPercent).toBeGreaterThan(45);
    expect(r.verdict).not.toBe("likely_human");
  });

  it("flags AI essays as likely AI with a real model judgement", () => {
    for (const s of S.filter((x) => x.kind === "ai")) {
      const r = combine(s.text, { probs: aiProbsFor(s.text, 88, 88), genre: "other" });
      expect(r.verdict, s.name).toBe("likely_ai");
      expect(r.reasons.length, s.name).toBeGreaterThan(0);
    }
  });

  it("keeps human, academic and ESL writing out of 'likely AI'", () => {
    for (const s of S.filter((x) => x.kind === "human")) {
      const genre = s.name.includes("ESL") ? "esl" : s.name.includes("academic") ? "academic" : "casual";
      const r = combine(s.text, { probs: aiProbsFor(s.text, 25, 25), genre });
      expect(r.verdict, s.name).not.toBe("likely_ai");
    }
  });

  it("highlights the AI half of a mixed text", () => {
    const s = S.find((x) => x.kind === "mixed")!;
    const r = combine(s.text, { probs: aiProbsFor(s.text, 90, 12, 3), genre: "other" });
    expect(r.spans.slice(0, 3).every((x) => x.label !== "ai")).toBe(true);
    expect(r.spans.slice(-3).every((x) => x.label === "ai")).toBe(true);
    expect(r.sections.some((x) => x.label === "ai")).toBe(true);
  });

  it("returns insufficient evidence for short text", () => {
    const s = S.find((x) => x.kind === "short")!;
    const r = combine(s.text, { probs: aiProbsFor(s.text, 95, 95) });
    expect(r.verdict).toBe("insufficient");
    expect(r.confidence).toBe("low");
  });

  it("keeps the original text intact across spans", () => {
    for (const s of S) expect(combine(s.text, null).spans.map((x) => x.text).join("")).toBe(s.text);
  });

  it("does not drop strongly AI-styled text to ~20% when the model reader is lenient", () => {
    for (const s of S.filter((x) => x.kind === "ai" && !x.name.includes("Edited"))) {
      const r = combine(s.text, { probs: aiProbsFor(s.text, 20, 20), genre: "other" });
      expect(r.aiPercent, s.name).toBeGreaterThanOrEqual(60);
      expect(["likely_ai", "possibly_ai"], s.name).toContain(r.verdict);
    }
  });

  it("reports strong agreement with more than low confidence", () => {
    const t = S[0]!.text;
    const r = combine(t, { probs: aiProbsFor(t, 90, 90), genre: "other" });
    expect(r.confidence).not.toBe("low");
    const h = S[3]!.text;
    const rh = combine(h, { probs: aiProbsFor(h, 10, 10), genre: "casual" });
    expect(rh.verdict).toBe("likely_human");
    expect(rh.confidence).not.toBe("low");
  });

  it("handles long text (all AI essays joined) and still flags it", () => {
    const t = S.filter((x) => x.kind === "ai").map((x) => x.text).join("\n\n");
    const r = combine(t, { probs: aiProbsFor(t, 80, 80), genre: "formal" });
    expect(r.sections.length).toBeGreaterThan(2);
    expect(r.verdict).toBe("likely_ai");
  });

  it("does not flag human writing even when the model reader is harsh-ish", () => {
    for (const s of S.filter((x) => x.kind === "human")) {
      const r = combine(s.text, { probs: aiProbsFor(s.text, 55, 55), genre: "other" });
      expect(r.verdict, s.name).not.toBe("likely_ai");
    }
  });

  it("says 'Unable to determine' when there is too little text", () => {
    expect(combine(S.find((x) => x.kind === "short")!.text, null).verdictText).toBe("Unable to determine");
  });

  it("only lists reasons that were detected", () => {
    const r = combine(S[3]!.text, { probs: aiProbsFor(S[3]!.text, 10, 10), genre: "casual" });
    expect(r.reasons.some((x) => /stock phrasing|predictable transitions/i.test(x))).toBe(false);
  });
});

describe("textSimilarity", () => {
  it("treats identical text as unchanged", () => {
    const s = "The results plays a crucial role in the outcome.";
    expect(textSimilarity(s, s)).toBe(1);
    expect(textSimilarity(s, s) >= REWRITE_SIMILARITY_LIMIT).toBe(true);
  });

  it("treats a one-word or punctuation tweak as unchanged", () => {
    const a = "Moreover, technology plays a crucial role in modern education today.";
    const b = "Moreover technology plays a crucial role in modern education today!";
    expect(textSimilarity(a, b) >= REWRITE_SIMILARITY_LIMIT).toBe(true);
  });

  it("accepts a genuinely restructured rewrite", () => {
    const a = "Moreover, technology plays a crucial role in modern education today.";
    const b = "Schools lean on tech for almost everything now, and it shows.";
    expect(textSimilarity(a, b) < REWRITE_SIMILARITY_LIMIT).toBe(true);
  });

  it("rejects a long passage with only superficial edits", () => {
    const original = S[0]!.text;
    const edited = original.replace("crucial", "important").replace("Moreover,", "Also,");
    expect(isMeaningfullyRewritten(original, edited)).toBe(false);
  });

  it("accepts a substantially reconstructed passage with the same topic", () => {
    const original = S[2]!.text;
    const rewrite = `Working from home gives employees flexibility and lets a company hire beyond its local area. It can also cut commuting and office costs. Those advantages come with tradeoffs, though. Without regular face-to-face contact, communication takes more effort, and some workers feel isolated or have trouble separating work from personal time. Companies need practical tools and consistent support if they want the arrangement to work well. Remote work can be useful, but it succeeds only when an organization plans for those challenges.`;
    expect(isMeaningfullyRewritten(original, rewrite)).toBe(true);
  });
});
