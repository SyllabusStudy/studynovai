export type GloLogEntry = { at: number; asked: string; said: string; action: string };

const KEY = "studynova:glo-log";

export function readGloLog(): GloLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function addGloLog(e: GloLogEntry) {
  const next = [e, ...readGloLog()].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("glo-log"));
}

export function clearGloLog() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("glo-log"));
}

export function describeGloAction(a: { type: string; [k: string]: unknown }): string {
  switch (a.type) {
    case "navigate": return `Opened ${String(a.to)}`;
    case "theme": return `Switched to ${String(a.mode)} mode`;
    case "email": return `Drafted an email to ${String(a.to)}`;
    case "note": return "Saved a new note";
    case "quiz": return "Made a quiz";
    case "flashcards": return "Made flashcards";
    default: return "Answered";
  }
}
