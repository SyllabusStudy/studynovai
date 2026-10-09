export const GLO_SILENCE_MS = 2000;

/** Keep the same utterance from being submitted again as recognition finalizes. */
export function createGloSpeechGate() {
  let lastText = "";
  let lastAt = -Infinity;
  return (text: string, busy: boolean, now: number) => {
    const normalized = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    if (busy || !normalized || (normalized === lastText && now - lastAt < 5000)) return false;
    lastText = normalized;
    lastAt = now;
    return true;
  };
}