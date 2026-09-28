import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CONNECTION_MESSAGE, fetchAiWithRetry } from "./ai-request.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AI request retries", () => {
  it("retries one request at a time and preserves the exact body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "ready" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const init = { method: "POST", body: JSON.stringify({ prompt: "keep this", classId: "class" }) };
    const pending = fetchAiWithRetry("google", "https://example.test/ai", init);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[2])).toEqual([undefined, undefined]);
    expect(fetchMock.mock.calls[0]?.[1]).toBe(init);
    expect(fetchMock.mock.calls[1]?.[1]).toBe(init);
  });

  it("does not retry credential denials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("denied", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchAiWithRetry("google", "https://example.test/ai", {})).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After and stops after three transient failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response("limited", { status: 429, headers: { "retry-after": "2" } }),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchAiWithRetry("google", "https://example.test/ai", {});
    const caught = pending.catch((error: Error) => error);
    await vi.runAllTimersAsync();
    expect((await caught).message).toBe(AI_CONNECTION_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry an aborted request", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAiWithRetry("google", "https://example.test/ai", {})).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});