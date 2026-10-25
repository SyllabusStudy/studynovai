/** Rule-based diagnosis for app health events — no AI cost, runs instantly. */
export const LAG_THRESHOLD_MS = 8000;
export const FREEZE_THRESHOLD_MS = 3000;

export type HealthKind = "lag" | "bug";

export function diagnose(kind: HealthKind, area: string, message: string, durationMs?: number | null): { diagnosis: string; fix: string } {
  const m = `${area} ${message}`.toLowerCase();
  if (/429|rate.?limit|quota|resource.?exhausted/.test(m))
    return { diagnosis: "The student's Google AI key hit its free-tier rate limit.", fix: "No code fix needed. The app retries automatically; if it repeats a lot, ask the student to wait a minute or upgrade their Google key tier." };
  if (/api.?key|401|403|permission|invalid key|unauthorized/.test(m))
    return { diagnosis: "The student's AI key was rejected or expired.", fix: "Ask the student to re-add their key in Settings → AI key. Check Admin → Users to see if their key is missing." };
  if (/failed to fetch|networkerror|load failed|network|offline|timeout|timed out/.test(m))
    return { diagnosis: "The student's internet connection dropped or was too slow.", fix: "Usually on their side (weak Wi-Fi / cell). If many students hit this at once, check that the site and backend are up." };
  if (/chunk|dynamically imported module|importing a module script/.test(m))
    return { diagnosis: "The student had an old version of the app open after you published an update.", fix: "No fix needed — a page refresh loads the new version." };
  if (/5\d\d|internal server|server error/.test(m))
    return { diagnosis: "A server action failed.", fix: "Check which page it happened on; if it repeats, tell Lovable the page and error text so it can be fixed." };
  if (/mic|microphone|notallowed|speech|recogni/.test(m))
    return { diagnosis: "Microphone or voice recognition was blocked or unavailable.", fix: "The student needs to allow microphone access in their browser settings. Typing in Glo still works." };
  if (kind === "lag") {
    const s = Math.round((durationMs ?? 0) / 100) / 10;
    if (area === "freeze")
      return { diagnosis: `The screen froze for ${s}s — the page was doing too much work at once.`, fix: "Often a very long note or big PDF. If one page shows up a lot, ask Lovable to speed up that page." };
    if (/ai|gemini|generativelanguage|serverfn|_serverfn/.test(m))
      return { diagnosis: `An AI request took ${s}s — Google's AI servers were slow or busy.`, fix: "Usually Google congestion at peak hours; retries handle it. If it's constant, ask Lovable to send less note context per request." };
    return { diagnosis: `A request took ${s}s to finish.`, fix: "Likely a slow connection or a big file upload. If the same page repeats, ask Lovable to optimize it." };
  }
  return { diagnosis: "An unexpected error happened in the app.", fix: "Check the page and message below. If it repeats, send the error text to Lovable to fix." };
}
