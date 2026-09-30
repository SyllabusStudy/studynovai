import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared study set — StudyNova" },
      { name: "description", content: "A classmate shared flashcards or a quiz made with StudyNova." },
      { property: "og:title", content: "Shared study set — StudyNova" },
      { property: "og:description", content: "Study these flashcards or take this quiz, made with StudyNova." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharePage,
});

type Card = { front: string; back: string };
type Q = { id?: string; prompt: string; options?: string[]; answer: string; explanation?: string };

function SharePage() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_item", { _token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link to="/"><BrandLogo /></Link>
        <Button asChild size="sm"><Link to="/auth">Sign up free</Link></Button>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {isLoading ? (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        ) : !data ? (
          <p className="surface-card p-6 text-center">This link doesn't exist anymore.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Shared {data.kind === "deck" ? "flashcards" : "quiz"}
              </p>
              <h1 className="font-display text-2xl font-bold">{data.title}</h1>
            </div>
            {data.kind === "deck" ? (
              <Cards cards={((data.payload as { cards?: Card[] }).cards ?? [])} />
            ) : (
              <Quiz questions={((data.payload as { questions?: Q[] }).questions ?? [])} />
            )}
            <div className="surface-card space-y-3 p-5 text-center">
              <p className="font-display text-lg font-bold">Made with StudyNova</p>
              <p className="text-sm text-muted-foreground">
                Create a free account to test yourself, track what you've mastered and make your own sets from your class notes.
              </p>
              <Button asChild><Link to="/auth">Create my free account</Link></Button>
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
