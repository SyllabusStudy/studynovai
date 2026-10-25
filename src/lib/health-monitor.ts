/** Browser-side sentinel: reports bugs and lags (technical info only — never prompts, notes or keys). */
import { supabase } from "@/integrations/supabase/client";
import { diagnose, FREEZE_THRESHOLD_MS, LAG_THRESHOLD_MS, type HealthKind } from "./health-diagnose";

const MAX_PER_SESSION = 15;
let sent = 0;
const seen = new Set<string>();
let started = false;

function clean(text: string, max: number) {
  // strip anything that looks like a key or token, and query strings
  return text.replace(/AIza[\w-]{20,}|sk-[\w-]{10,}|eyJ[\w.-]{20,}/g, "[hidden]").replace(/\?[^\s"']*/g, "").slice(0, max);
}

async function report(kind: HealthKind, area: string, rawMessage: string, durationMs?: number) {
  if (sent >= MAX_PER_SESSION) return;
  const message = clean(rawMessage || "Unknown", 600);
  const sig = `${kind}:${area}:${message.slice(0, 120)}`;
  if (seen.has(sig)) return;
  seen.add(sig);
  sent++;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const { diagnosis, fix } = diagnose(kind, area, message, durationMs);
    await supabase.from("app_health_events").insert({
      user_id: userId, kind, area: area.slice(0, 80), message,
      duration_ms: durationMs ? Math.round(durationMs) : null,
      page: window.location.pathname.slice(0, 200),
      device: navigator.userAgent.slice(0, 200),
      diagnosis, fix,
    });
  } catch { /* never let monitoring break the app */ }
}

export function startHealthMonitor() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", (e) => {
    if (!e.message || /ResizeObserver loop/.test(e.message)) return;
    void report("bug", "crash", e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { name?: string; message?: string } | undefined;
    if (r?.name === "AbortError") return;
    void report("bug", "unhandled", r?.message ?? String(e.reason));
  });
  if (typeof PerformanceObserver === "undefined") return;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (entry.duration < LAG_THRESHOLD_MS) continue;
        if (!["fetch", "xmlhttprequest"].includes(entry.initiatorType)) continue;
        if (/app_health_events|realtime|stream/.test(entry.name)) continue;
        let path = entry.name;
        try { path = new URL(entry.name).host + new URL(entry.name).pathname; } catch { /* keep */ }
        const area = /_serverfn/i.test(path) ? "serverfn" : /generativelanguage|gateway/.test(path) ? "ai" : "request";
        void report("lag", area, `Slow request: ${path}`, entry.duration);
      }
    }).observe({ type: "resource", buffered: false });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= FREEZE_THRESHOLD_MS) void report("lag", "freeze", "Screen froze (long task)", entry.duration);
      }
    }).observe({ type: "longtask", buffered: false });
  } catch { /* unsupported */ }
}
