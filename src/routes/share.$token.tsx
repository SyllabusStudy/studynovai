import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSharedItem } from "@/lib/share.functions";

const SITE = "https://studynova.link";
const SHARE_IMAGE = `${SITE}/share-card.jpg`;

export const Route = createFileRoute("/share/$token")({
  loader: ({ params }) => getSharedItem({ data: { token: params.token } }),
  head: ({ params, loaderData }) => {
    const item = loaderData ?? null;
    const label = item
      ? item.kind === "deck"
        ? `${item.count} Flashcard${item.count === 1 ? "" : "s"}`
        : `${item.count} Question${item.count === 1 ? "" : "s"}`
      : null;
    const title = item ? `${item.title} — ${label} | SyllabusNova` : "Shared study set — SyllabusNova";
    const description = item
      ? `Interactive study set on SyllabusNova • Free to practice — no account needed.`
      : "A classmate shared flashcards or a quiz made with SyllabusNova.";
    const url = `${SITE}/share/${params.token}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "og:image", content: SHARE_IMAGE },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: SHARE_IMAGE },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SharePage,
});

type Card = { front: string; back: string };
type Q = { id?: string; prompt: string; options?: string[]; answer: string; explanation?: string };

function SharePage() {
  const data = Route.useLoaderData();
  const count = data?.count ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link to="/"><BrandLogo /></Link>
        <Button asChild size="sm"><Link to="/auth">Sign up free</Link></Button>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {!data ? (
          <p className="surface-card p-6 text-center">This link doesn't exist anymore.</p>
        ) : (
          <>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {data.kind === "deck" ? "Flashcard deck" : "Practice quiz"} · {count}{" "}
                {data.kind === "deck" ? (count === 1 ? "card" : "cards") : count === 1 ? "question" : "questions"}
              </span>
              <h1 className="font-display text-2xl font-bold">{data.title}</h1>
              <p className="text-sm text-muted-foreground">Start studying right away — no account needed.</p>
            </div>
            {data.kind === "deck" ? (
              <Cards cards={(data.payload.cards ?? []) as Card[]} />
            ) : (
              <Quiz questions={(data.payload.questions ?? []) as Q[]} />
            )}

            <div className="surface-card space-y-3 p-5 text-center">
              <p className="font-display text-lg font-bold">Want to make your own from your lecture notes?</p>
              <p className="text-sm text-muted-foreground">
                SyllabusNova turns your class notes and recordings into flashcards and quizzes in seconds.
              </p>
              <Button asChild><Link to="/auth">Try free</Link></Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}


function Cards({ cards }: { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[i];
  if (!c) return <p className="text-sm text-muted-foreground">No cards in this deck.</p>;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setFlip((f) => !f)}
        className="surface-card flex min-h-52 w-full items-center justify-center p-6 text-center text-lg font-semibold"
      >
        {flip ? c.back : c.front}
      </button>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }}>Back</Button>
        <span className="text-sm text-muted-foreground">{i + 1} / {cards.length} · tap to flip</span>
        <Button variant="outline" size="sm" disabled={i >= cards.length - 1} onClick={() => { setI(i + 1); setFlip(false); }}>Next</Button>
      </div>
    </div>
  );
}

function Quiz({ questions }: { questions: Q[] }) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [shown, setShown] = useState<Record<number, boolean>>({});
  return (
    <ol className="space-y-3">
      {questions.map((q, n) => (
        <li key={n} className="surface-card space-y-2 p-4">
          <p className="font-semibold">{n + 1}. {q.prompt}</p>
          {q.options?.length ? (
            <div className="grid gap-2">
              {q.options.map((o) => {
                const chosen = picked[n] === o;
                const done = picked[n] != null;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={done}
                    onClick={() => setPicked({ ...picked, [n]: o })}
                    className={cn(
                      "rounded-lg border border-border p-2 text-left text-sm",
                      done && o === q.answer && "border-success bg-success/10",
                      chosen && o !== q.answer && "border-destructive bg-destructive/10",
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setShown({ ...shown, [n]: true })}>Show answer</Button>
          )}
          {(picked[n] != null || shown[n]) && (
            <p className="text-sm text-muted-foreground"><strong>Answer:</strong> {q.answer}{q.explanation ? ` — ${q.explanation}` : ""}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
