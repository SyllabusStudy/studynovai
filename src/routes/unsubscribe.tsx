import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailX } from "lucide-react";
import { unsubscribeFromNews } from "@/lib/announce.functions";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Unsubscribe from SyllabusStudy announcements" },
      { name: "description", content: "Stop receiving SyllabusStudy announcement emails. Your account and study materials stay exactly as they are." },
      { property: "og:title", content: "Unsubscribe from SyllabusStudy announcements" },
      { property: "og:description", content: "Stop receiving SyllabusStudy announcement emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({ u: typeof search["u"] === "string" ? search["u"] : "" }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { u } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await unsubscribeFromNews({ data: { userId: u } });
        if (!cancelled) setState(result.ok ? "done" : "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [u]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <MailX className="size-8 text-primary" />
      {state === "loading" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Updating your email settings…
        </p>
      ) : state === "done" ? (
        <>
          <h1 className="mt-4 text-2xl font-bold">You're unsubscribed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We won't email you about news or discounts again. Your account, classes and study materials are untouched, and
            reminders you set up still work.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-2xl font-bold">That link didn't work</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You can turn announcement emails off any time in Settings inside SyllabusStudy.
          </p>
        </>
      )}
      <Link to="/" className="mt-6 text-sm font-semibold text-primary underline">
        Back to SyllabusStudy
      </Link>
    </div>
  );
}
