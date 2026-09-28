import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DeleteButton } from "@/components/DeleteButton";
import { Hint } from "@/components/Hint";
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

export const Route = createFileRoute("/_authenticated/flashcards/")({
  head: () => ({
    meta: [
      { title: "Flashcards — StudyNova" },
      { name: "description", content: "AI-generated flashcard decks from your own chapters, notes and slides." },
      { property: "og:title", content: "Flashcards — StudyNova" },
      { property: "og:description", content: "AI flashcard decks generated from your own course materials." },
    ],
  }),
  component: FlashcardsPage,
});

export const UNGROUPED = "Earlier cards";

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
  const [busy, setBusy] = useState(false);
  const run = useServerFn(generateFlashcards);

  const openAssignments = useMemo(
    () => assignments.filter((a) => a.status !== "completed"),
    [assignments],
  );

  const decks = useMemo(() => {
    const map = new Map<string, { size: number; reviewed: number; created: string }>();
    for (const c of cards) {
      const key = c.deck ?? UNGROUPED;
      const entry = map.get(key) ?? { size: 0, reviewed: 0, created: c.created_at };
      entry.size += 1;
      entry.reviewed += c.times_reviewed > 0 ? 1 : 0;
      if (c.created_at > entry.created) entry.created = c.created_at;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.created.localeCompare(a.created));
  }, [cards]);

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
      setDeckName("");
      toast.success(`New deck ready: ${result.deck}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDeck(name: string) {
    let q = supabase.from("flashcards").delete();
    q = name === UNGROUPED ? q.is("deck", null) : q.eq("deck", name);
    if (classId) q = q.eq("class_id", classId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
  }

  return (
    <div>
      <PageHeader
        title="Flashcards"
        description="Every generation becomes its own deck, so new cards never mix into an old set."
      />

      <Hint id="flashcards-deck" point="down" className="mb-4">
        Pick a class, choose a source or let it use all your materials, then hit generate — each set gets its own deck name so nothing overlaps.
      </Hint>

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="space-y-1.5">
          <Label htmlFor="deckName">Deck name (optional)</Label>
          <Input
            id="deckName"
            placeholder="Auto-named for you"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button onClick={generate} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate a new deck
          </Button>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">Your decks</h2>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : decks.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No flashcards yet"
          description="Turn your notes or class materials into flashcards — pick a class above and hit Create Flashcards."
        />
      ) : (
        <ul className="space-y-2">
          {decks.map((d) => (
            <li key={d.name} className="surface-card flex items-center gap-3 p-4">
              <Brain className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.size} cards · {d.reviewed} reviewed
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/flashcards/$deck" params={{ deck: encodeURIComponent(d.name) }}>
                  {d.reviewed > 0 ? "Review" : "Study"}
                </Link>
              </Button>
              <DeleteButton
                label="deck"
                description={`All ${d.size} cards in "${d.name}" will be removed. Your other decks stay.`}
                onDelete={() => deleteDeck(d.name)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
