import { MoreOptions } from "@/components/MoreOptions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useClassPicker } from "@/lib/active-class";
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
import { AiKeySetupBanner, useAiKeyRedirect } from "@/lib/ai-key-gate";

export const Route = createFileRoute("/_authenticated/flashcards/")({
  head: () => ({
    meta: [
      { title: "Flashcards — StudyNova" },
      { name: "description", content: "AI-generated flashcard decks from your own chapters, notes and slides." },
      { property: "og:title", content: "Flashcards — StudyNova" },
      { property: "og:description", content: "AI flashcard decks generated from your own course materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlashcardsPage,
});

export const UNGROUPED = "Earlier cards";

function FlashcardsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [classId, setClassId] = useClassPicker("");
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
  const redirectForKey = useAiKeyRedirect();

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
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (!redirectForKey(msg)) toast.error(msg);
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
      <PageHeader title="Flashcards" description="Make a deck from your notes, then study it." />
      <ClassActionBar hide={["flashcards"]} />

      <Hint id="flashcards-deck" point="down" className="mb-4 hidden sm:flex">
        Pick a class and hit Make flashcards. Extra settings are under More options.
      </Hint>

      <section className="surface-card space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Brain className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">New deck</h2>
            <p className="text-xs text-muted-foreground">From your class materials and homework</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
              <SelectTrigger className="h-11">
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
          <Button onClick={generate} disabled={busy} size="lg" className="h-11 w-full gap-1.5 sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Making your deck…" : "Make flashcards"}
          </Button>
        </div>

        <MoreOptions summary={`${count} cards · ${difficulty}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Label htmlFor="count">How many cards</Label>
              <Input id="count" type="number" min={5} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
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
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="deckName">Deck name</Label>
              <Input id="deckName" placeholder="Auto-named for you" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
            </div>
          </div>
        </MoreOptions>
      </section>

      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Your decks</h2>
        {decks.length ? <span className="text-xs text-muted-foreground">{decks.length} total</span> : null}
      </div>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : decks.length === 0 ? (
        <EmptyState icon={Brain} title="No flashcards yet" description="Pick a class above and tap Make flashcards." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {decks.map((d) => {
            const pct = d.size ? Math.round((d.reviewed / d.size) * 100) : 0;
            return (
              <li key={d.name} className="surface-card flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Brain className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.size} cards · {d.reviewed} reviewed
                    </p>
                  </div>
                  <DeleteButton
                    label="deck"
                    description={`All ${d.size} cards in "${d.name}" will be removed. Your other decks stay.`}
                    onDelete={() => deleteDeck(d.name)}
                  />
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <Button asChild size="sm" className="w-full">
                  <Link to="/flashcards/$deck" params={{ deck: encodeURIComponent(d.name) }}>
                    {d.reviewed > 0 ? "Keep reviewing" : "Start studying"}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
