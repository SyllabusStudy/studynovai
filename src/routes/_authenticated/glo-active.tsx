import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MascotBot } from "@/components/ToolsMascot";
import { clearGloLog, readGloLog, type GloLogEntry } from "@/lib/glo-log";
import { GloDesktopButton } from "@/components/GloDesktopDialog";

export const Route = createFileRoute("/_authenticated/glo-active")({
  head: () => ({
    meta: [
      { title: "Glo Active — what Glo has done | SyllabusStudy" },
      { name: "description", content: "See everything Glo, your voice study buddy, has done for you." },
      { property: "og:title", content: "Glo Active — what Glo has done | SyllabusStudy" },
      { property: "og:description", content: "See everything Glo, your voice study buddy, has done for you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GloActive,
});

function GloActive() {
  const [log, setLog] = useState<GloLogEntry[]>([]);
  useEffect(() => {
    const load = () => setLog(readGloLog());
    load();
    window.addEventListener("glo-log", load);
    return () => window.removeEventListener("glo-log", load);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <MascotBot />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold">Glo Active</h1>
          <p className="text-sm text-muted-foreground">Everything Glo has done for you on this device.</p>
        </div>
        {log.length > 0 && (
          <button type="button" onClick={clearGloLog} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </header>
      <GloDesktopButton className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm font-bold text-primary hover:bg-primary/15" />
      {log.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nothing yet. Say “Hey Glo, what do I have due?” to get started. <Link to="/glo" className="text-primary underline">What can Glo do?</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {log.map((e) => (
            <li key={e.at} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-primary">{e.action}</span>
                <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-muted-foreground">You: “{e.asked}”</p>
              <p className="mt-1 text-sm text-foreground">Glo: {e.said}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
