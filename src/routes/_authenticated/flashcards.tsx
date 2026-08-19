import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateFlashcards } from "@/lib/ai.functions";
import { DIFFICULTIES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { classLabel, useAssignments, useClasses, useDocuments, useFlashcards } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — StudyMate AI" },
      { name: "description", content: "AI-generated flashcards from your own chapters, notes and slides." },
      { property: "og:title", content: "Flashcards — StudyMate AI" },
      { property: "og:description", content: "AI flashcards generated from your own course materials." },
    ],
  }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [classId, setClassId] = useState("");
  const { data: documents = [] } = useDocuments(user?.id, classId || undefined);
  const { data: cards = [], isLoading } = useFlashcards(user?.id, classId || undefined);
  const { data: assignments = [] } = useAssignments(user?.id, classId || undefined);
  const [documentId, setDocumentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("all");
  const [count, setCount] = useState(15);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [deckName, setDeckName] = useState("");
  const [activeDeck, setActiveDeck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const run = useServerFn(generateFlashcards);

  const openAssignments = useMemo(
    () => assignments.filter((a) => a.status !== "completed"),
    [assignments],
  );

  const decks = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      const key = c.deck ?? "Earlier cards";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, size]) => ({ name, size }));
  }, [cards]);

  const selectedDeck = activeDeck && decks.some((d) => d.name === activeDeck) ? activeDeck : decks[0]?.name ?? null;

  const deck = useMemo(
    () => (selectedDeck ? cards.filter((c) => (c.deck ?? "Earlier cards") === selectedDeck) : []),
    [cards, selectedDeck],
  );
  const current = deck[index];

  async function generate() {
    if (!classId) {
      toast.error("Pick a class first");
      return;
    }
    setBusy(true);
    try {
      const result = await run({
        data: {
          classId,
          documentId: documentId || null,
          count,
          difficulty,
          deck: deckName.trim() || null,
          assignmentId: assignmentId !== "all" && assignmentId !== "none" ? assignmentId : null,
          matchHomework: assignmentId === "all",
        },
      });
      await qc.invalidateQueries({ queryKey: ["flashcards"] });
      setActiveDeck(result.deck);
      setDeckName("");
      setIndex(0);
      setFlipped(false);
      toast.success(`New deck ready: ${result.deck}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDeck() {
    if (!selectedDeck) return;
    const ids = deck.map((c) => c.id);
    const { error } = await supabase.from("flashcards").delete().in("id", ids);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
    setActiveDeck(null);
    setIndex(0);
    setFlipped(false);
  }

  async function review(correct: boolean) {
    if (!current) return;
    await supabase
      .from("flashcards")
      .update({
        times_reviewed: current.times_reviewed + 1,
        times_correct: current.times_correct + (correct ? 1 : 0),
      })
      .eq("id", current.id);
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
    setFlipped(false);
    setIndex((i) => (i + 1) % Math.max(deck.length, 1));
  }

  return (
    <div>
      <PageHeader title="Flashcards" description="Generate a deck from your materials, aimed at the homework that's actually due." />

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Class</Label>
          <Select
            value={classId}
            onValueChange={(v) => {
              setClassId(v);
              setDocumentId("");
              setAssignmentId("all");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source document</Label>
          <Select value={documentId} onValueChange={setDocumentId}>
            <SelectTrigger>
              <SelectValue placeholder="All materials" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Match my homework</Label>
          <Select value={assignmentId} onValueChange={setAssignmentId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All upcoming homework &amp; exams</SelectItem>
              <SelectItem value="none">Don't match homework</SelectItem>
              {openAssignments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                  {a.due_date ? ` · due ${a.due_date}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="count">How many</Label>
          <Input
            id="count"
            type="number"
            min={5}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <Button onClick={generate} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate flashcards
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : deck.length === 0 || !current ? (
          <EmptyState
            icon={Brain}
            title="No flashcards yet"
            description="Pick a class and generate your first deck from your uploaded materials."
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
              Card {index + 1} of {deck.length} · tap to flip
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => void review(false)}>
                Still learning
              </Button>
              <Button onClick={() => void review(true)}>Got it</Button>
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
