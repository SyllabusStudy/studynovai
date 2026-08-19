import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Brain, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useFlashcards } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/flashcards/$deck")({
  head: () => ({
    meta: [
      { title: "Study a deck — StudyMate AI" },
      { name: "description", content: "Flip through one flashcard deck built from your own course material." },
      { property: "og:title", content: "Study a deck — StudyMate AI" },
      { property: "og:description", content: "Review a single AI-generated flashcard deck." },
    ],
  }),
  component: DeckPage,
});

const UNGROUPED = "Earlier cards";

function DeckPage() {
  const { deck: rawDeck } = useParams({ from: "/_authenticated/flashcards/$deck" });
  const deckName = decodeURIComponent(rawDeck);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useFlashcards(user?.id);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = useMemo(
    () => cards.filter((c) => (c.deck ?? UNGROUPED) === deckName),
    [cards, deckName],
  );
  const current = deck[Math.min(index, Math.max(deck.length - 1, 0))];

  /** Advance instantly; the review counter saves in the background so flipping never lags. */
  function review(correct: boolean) {
    if (!current) return;
    setFlipped(false);
    setIndex((i) => (i + 1) % Math.max(deck.length, 1));
    void supabase
      .from("flashcards")
      .update({
        times_reviewed: current.times_reviewed + 1,
        times_correct: current.times_correct + (correct ? 1 : 0),
      })
      .eq("id", current.id)
      .then(() => qc.invalidateQueries({ queryKey: ["flashcards"] }));
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <Link to="/flashcards">
          <ArrowLeft className="size-4" /> All decks
        </Link>
      </Button>

      <h1 className="text-xl font-semibold tracking-tight">{deckName}</h1>

      <div className="mt-6">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : !current ? (
          <EmptyState
            icon={Brain}
            title="This deck is empty"
            description="Generate a new deck from the flashcards page."
          />
        ) : (
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="surface-card flex min-h-52 w-full items-center justify-center p-8 text-center text-lg font-semibold"
            >
              {flipped ? current.back : current.front}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Card {Math.min(index + 1, deck.length)} of {deck.length} · tap to flip
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => review(false)}>
                Still learning
              </Button>
              <Button onClick={() => review(true)}>Got it</Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Restart deck"
                onClick={() => {
                  setIndex(0);
                  setFlipped(false);
                }}
              >
                <RotateCcw className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
