import law from "@/assets/covers/law.jpg";
import science from "@/assets/covers/science.jpg";
import math from "@/assets/covers/math.jpg";
import literature from "@/assets/covers/literature.jpg";
import culture from "@/assets/covers/culture.jpg";
import education from "@/assets/covers/education.jpg";
import business from "@/assets/covers/business.jpg";
import health from "@/assets/covers/health.jpg";
import computing from "@/assets/covers/computing.jpg";
import society from "@/assets/covers/society.jpg";
import campus from "@/assets/covers/campus.jpg";

export const COVERS = {
  law: { src: law, label: "Law & Justice" },
  science: { src: science, label: "Science Lab" },
  math: { src: math, label: "Math & Physics" },
  literature: { src: literature, label: "Books & Writing" },
  culture: { src: culture, label: "History & Culture" },
  education: { src: education, label: "Classroom" },
  business: { src: business, label: "Business & Economics" },
  health: { src: health, label: "Health & Medicine" },
  computing: { src: computing, label: "Computer Science" },
  society: { src: society, label: "Social Sciences" },
  campus: { src: campus, label: "Campus" },
} as const;
export type CoverKey = keyof typeof COVERS;

// Ordered: first match wins. Course-code prefixes use word boundaries.
const RULES: [CoverKey, RegExp][] = [
  ["law", /\b(crj|cj|crim|law|legal|justice|criminolog|court|police|paralegal)/i],
  ["culture", /\b(ethn|afr|pan-african|african|chicano|latin|asian am|native am|history|hist|art hist|culture|cultural|anthro|indigenous|gender|women)/i],
  ["health", /\b(nurs|anatomy|physiolog|kin|public health|health|med|pharm|nutrition|dental)/i],
  ["science", /\b(bio|chem|lab|geol|environment|ecolog|microbio|astro|science|sci\b)/i],
  ["math", /\b(math|calc|algebra|statistic|stat\b|geometry|physics|phys|trig|engineer)/i],
  ["computing", /\b(cs\b|comp sci|computer|programming|coding|software|data|cis|it\b|cyber)/i],
  ["business", /\b(econ|business|bus\b|acct|account|financ|market|management|mgmt)/i],
  ["education", /\b(educ|teaching|critical thinking|pedagog|learning)/i],
  ["literature", /\b(engl|english|lit|writing|composition|rhetoric|poetry|reading|journalism|comm\b|communication|philos)/i],
  ["society", /\b(psych|soc\b|sociolog|poli|political|government|gov\b|social|human dev)/i],
];

export function autoCover(c: { class_name?: string | null; course_code?: string | null }): CoverKey {
  const text = `${c.course_code ?? ""} ${c.class_name ?? ""}`;
  for (const [k, re] of RULES) if (re.test(text)) return k;
  return "campus";
}

const KEY = "studynova:class-covers";
function readOverrides(): Record<string, CoverKey> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function setCoverOverride(classId: string, key: CoverKey | null) {
  const o = readOverrides();
  if (key) o[classId] = key; else delete o[classId];
  localStorage.setItem(KEY, JSON.stringify(o));
  window.dispatchEvent(new Event("class-covers"));
}

import { useEffect, useState } from "react";
export function useCoverOverrides() {
  const [o, setO] = useState<Record<string, CoverKey>>({});
  useEffect(() => {
    const r = () => setO(readOverrides());
    r();
    window.addEventListener("class-covers", r);
    return () => window.removeEventListener("class-covers", r);
  }, []);
  return o;
}

export function coverFor(c: { id: string; class_name?: string | null; course_code?: string | null }, overrides: Record<string, CoverKey>) {
  const k = overrides[c.id] && COVERS[overrides[c.id]!] ? overrides[c.id]! : autoCover(c);
  return COVERS[k].src;
}
