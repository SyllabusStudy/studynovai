/** One sequential retry sequence for each AI operation. Never retry credentials, policy denials, or malformed requests. */
import { AI_CONNECTION_MESSAGE } from "./ai-messages";
export { AI_CONNECTION_MESSAGE } from "./ai-messages";

const MAX_ATTEMPTS = 3;
const MAX_WAIT_MS = 15_000;

function retryDelay(response: Response | null, attempt: number): number | null {
  const header = response?.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    const until = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    // Respect long provider cooldowns without keeping a single request open for minutes.
    if (Number.isFinite(until) && until > MAX_WAIT_MS) return null;
    if (Number.isFinite(until) && until >= 0) return until;
  }
  return Math.min(MAX_WAIT_MS, 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 350));
}

export async function fetchAiWithRetry(provider: string, url: string, init: RequestInit, maxAttempts = MAX_ATTEMPTS): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // Cancellation is intentional and must never start another generation.
      if (init.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      console.warn("AI request connection failure", { provider, attempt, kind: "network" });
      if (attempt === maxAttempts) throw new Error(AI_CONNECTION_MESSAGE);
      await new Promise((resolve) => setTimeout(resolve, retryDelay(null, attempt) ?? 800));
      continue;
    }

    if (response.status !== 429 && response.status < 500) return response;

    // A provider access denial is terminal even if an intermediary mislabels its status.
    // Never replay it, and preserve the original response for the caller.
    if (response.status >= 500) {
      const reason = response.clone();
      const text = (await reason.text()).slice(0, 1000);
      if (/provider_not_available|permission_error|access.denied|account (?:disabled|suspended)|model_requires_retention_consent|"stop_reason"\s*:\s*"refusal"/i.test(text)) return response;
    }

    // Only status and attempt are logged: never keys, prompts, attachments or response bodies.
    console.warn("AI request temporarily failed", { provider, attempt, status: response.status });
    if (attempt === maxAttempts) {
      await response.body?.cancel();
      throw new Error(AI_CONNECTION_MESSAGE);
    }
    const delay = retryDelay(response, attempt);
    if (delay === null) {
      await response.body?.cancel();
      throw new Error(AI_CONNECTION_MESSAGE);
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(AI_CONNECTION_MESSAGE);
}