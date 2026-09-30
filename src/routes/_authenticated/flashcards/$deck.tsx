import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Brain, Flag, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useFlashcards } from "@/lib/data";
import { ShareButton } from "@/components/ShareButton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/flashcards/$deck")({
  head: () => ({
    meta: [
      { title: "Study a deck — SyllableStudy" },
      { name: "description", content: "Flip through one flashcard deck built from your own course material." },
      { property: "og:title", content: "Study a deck — SyllableStudy" },
      { property: "og:description", content: "Review a single AI-generated flashcard deck." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeckPage,
});

const UNGROUPED = "Earlier cards";
/** Special deck name that gathers every flagged card across all decks. */
export const FLAGGED_DECK = "Flagged for review";

function DeckPage() {
  const { deck: rawDeck } = useParams({ from: "/_authenticated/flashcards/$deck" });
  const deckName = decodeURIComponent(rawDeck);
  const isFlaggedDeck = deckName === FLAGGED_DECK;
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useFlashcards(user?.id);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const all = useMemo(
    () => (isFlaggedDeck ? cards.filter((c) => c.flagged) : cards.filter((c) => (c.deck ?? UNGROUPED) === deckName)),
    [cards, deckName, isFlaggedDeck],
  );
  const flaggedCount = all.filter((c) => c.flagged).length;
  const deck = onlyFlagged && !isFlaggedDeck ? all.filter((c) => c.flagged) : all;
  const safeIndex = deck.length ? Math.min(index, deck.length - 1) : 0;
  const current = deck[safeIndex];

  function go(step: number) {
    if (!deck.length) return;
    setFlipped(false);
    setIndex((i) => {
      const next = (Math.min(i, deck.length - 1) + step) % deck.length;
      return next < 0 ? deck.length - 1 : next;
    });
  }

  /** Advance instantly; the review counter saves in the background so flipping never lags. */
  function review(correct: boolean) {
    if (!current) return;
    void recordStudyActivity("flashcards", qc);
    go(1);
    void supabase
      .from("flashcards")
      .update({
        times_reviewed: current.times_reviewed + 1,
        times_correct: current.times_correct + (correct ? 1 : 0),
      })
      .eq("id", current.id)
      .then(() => qc.invalidateQueries({ queryKey: ["flashcards"] }));
  }

  function toggleFlag() {
    if (!current) return;
    const next = !current.flagged;
    void supabase
      .from("flashcards")
      .update({ flagged: next })
      .eq("id", current.id)
      .then(() => qc.invalidateQueries({ queryKey: ["flashcards"] }));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key.toLowerCase() === "f") toggleFlag();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <Link to="/flashcards">
          <ArrowLeft className="size-4" /> All decks
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{deckName}</h1>
        {deck.length && !isFlaggedDeck ? (
          <ShareButton kind="deck" refId={deckName} title={deckName} payload={() => ({ cards: deck.map((c) => ({ front: c.front, back: c.back })) })} />
        ) : null}
      </div>

      {!isFlaggedDeck && all.length ? (
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant={onlyFlagged ? "outline" : "default"}
            onClick={() => {
              setOnlyFlagged(false);
              setIndex(0);
              setFlipped(false);
            }}
          >
            All cards ({all.length})
          </Button>
          <Button
            size="sm"
            variant={onlyFlagged ? "default" : "outline"}
            disabled={flaggedCount === 0}
            onClick={() => {
              setOnlyFlagged(true);
              setIndex(0);
              setFlipped(false);
            }}
          >
            <Flag className="size-3.5" /> Need review ({flaggedCount})
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : !current ? (
          <EmptyState
            icon={Brain}
            title={onlyFlagged || isFlaggedDeck ? "Nothing flagged yet" : "This deck is empty"}
            description={
              onlyFlagged || isFlaggedDeck
                ? "Tap the flag on any card you don't know and it shows up here."
                : "Generate a new deck from the flashcards page."
            }
          />
        ) : (
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="surface-card relative flex min-h-52 w-full items-center justify-center p-8 text-center text-lg font-semibold"
            >
              {current.flagged ? (
                <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  <Flag className="size-3" /> Need review
                </span>
              ) : null}
              {flipped ? current.back : current.front}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Card {safeIndex + 1} of {deck.length} · tap to flip
            </p>

            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous card" onClick={() => go(-1)}>
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={current.flagged ? "Remove flag" : "Flag this card"}
                onClick={toggleFlag}
                className={cn("gap-1.5", current.flagged && "border-amber-500 text-amber-600 dark:text-amber-400")}
              >
                <Flag className="size-4" />
                {current.flagged ? "Flagged" : "Flag"}
              </Button>
              <Button variant="outline" size="icon" aria-label="Next card" onClick={() => go(1)}>
                <ArrowRight className="size-4" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
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
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Arrow keys move back and forward · space flips · F flags
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
