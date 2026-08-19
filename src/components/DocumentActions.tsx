import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, CalendarPlus, FileQuestion, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeSyllabus, generateFlashcards, generateQuiz } from "@/lib/ai.functions";
import { documentIsReady, type DocumentRow } from "@/lib/data";

/** Per-document AI actions: build a deck, build a quiz, or pull dates onto the calendar. */
export function DocumentActions({ doc }: { doc: DocumentRow }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"cards" | "quiz" | "dates" | null>(null);
  const runCards = useServerFn(generateFlashcards);
  const runQuiz = useServerFn(generateQuiz);
  const runDates = useServerFn(analyzeSyllabus);

  const ready = documentIsReady(doc);
  const disabled = !ready || busy !== null;

  async function makeCards() {
    if (!doc.class_id) return;
    setBusy("cards");
    try {
      const res = await runCards({
        data: {
          classId: doc.class_id,
          documentId: doc.id,
          count: 15,
          difficulty: "medium",
          matchHomework: true,
        },
      });
      await qc.invalidateQueries({ queryKey: ["flashcards"] });
      toast.success(`${res.created} flashcards made from ${doc.file_name}`);
      void navigate({ to: "/flashcards" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make flashcards");
    } finally {
      setBusy(null);
    }
  }

  async function makeQuiz() {
    if (!doc.class_id) return;
    setBusy("quiz");
    try {
      const res = await runQuiz({
        data: {
          classId: doc.class_id,
          documentId: doc.id,
          count: 10,
          difficulty: "medium",
          types: ["multiple_choice", "true_false", "short_answer"],
          title: `Quiz · ${doc.file_name.replace(/\.[^.]+$/, "")}`,
          matchHomework: true,
        },
      });
      await qc.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("Quiz ready");
      void navigate({ to: "/quizzes/$quizId", params: { quizId: res.quizId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make a quiz");
    } finally {
      setBusy(null);
    }
  }

  async function addDates() {
    setBusy("dates");
    try {
      const res = await runDates({ data: { documentId: doc.id } });
      await qc.invalidateQueries();
      toast.success(
        res.eventsCreated > 0
          ? `Added ${res.eventsCreated} dates to your calendar`
          : "No new dates found in this document",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read dates from this document");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={() => void makeCards()}>
        {busy === "cards" ? <Loader2 className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
        Flashcards
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={() => void makeQuiz()}>
        {busy === "quiz" ? <Loader2 className="size-3.5 animate-spin" /> : <FileQuestion className="size-3.5" />}
        Quiz
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={() => void addDates()}>
        {busy === "dates" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CalendarPlus className="size-3.5" />
        )}
        Add dates to calendar
      </Button>
    </div>
  );
}
