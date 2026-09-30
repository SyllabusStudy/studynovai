/**
 * Per-tab working memory.
 *
 * Each open tool tab keeps its unfinished work (typed text, current chat,
 * chosen mode) in sessionStorage so moving between tabs never wipes it.
 * Closing the tab — or the whole browser tab — throws that memory away.
 */

const PREFIX = "studynova.tabmem.v1:";

function key(scope: string): string {
  return `${PREFIX}${scope}`;
}

export function readTabMemory<T>(scope: string | undefined): T | null {
  if (!scope || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(scope));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeTabMemory(scope: string | undefined, value: unknown) {
  if (!scope || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key(scope), JSON.stringify(value));
  } catch {
    /* storage full or unavailable — the work just isn't restored */
  }
}

/** Forgets the memory for one tab (and anything nested under it). */
export function clearTabMemory(scope: string | undefined) {
  if (!scope || typeof window === "undefined") return;
  try {
    const exact = key(scope);
    const nested = `${exact}/`;
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && (k === exact || k.startsWith(nested))) doomed.push(k);
    }
    doomed.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
