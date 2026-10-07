import { useEffect, useState } from "react";
import { Lightbulb, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { startTour } from "@/lib/tour";
import { useDraggable } from "@/lib/use-draggable";

const TOPICS: { q: string; steps: string[]; focus?: string }[] = [
  { q: "How do I add a class?", focus: "nav-classes", steps: ["Open My Classes.", "Click + Add class.", "Type the class name and details, then save."] },
  { q: "How do I upload a syllabus?", focus: "add-class", steps: ["Open a class or click Upload Syllabus on Home.", "Add your syllabus PDF or a photo of it.", "We find every exam and due date and add them to your calendar."] },
  { q: "How do I sync Canvas or Blackboard?", steps: ["In Canvas, open Calendar → Calendar Feed and copy the link.", "In SyllabusStudy, open Calendar and paste it into calendar sync.", "Your due dates stay updated by themselves."] },
  { q: "How do I track assignments?", focus: "nav-assignments", steps: ["Open Assignments and click + Add Assignment.", "Filter by Due Soon, Overdue or Completed.", "Tap Ask AI on any card for help, and check it off when done."] },
  { q: "How do I take notes?", focus: "nav-notes", steps: ["Open Notes and start a new note.", "Pick its class at the top — it shows in that class's Notes tab.", "The title names itself from what you write, and it saves automatically."] },
  { q: "How do I handwrite or draw in notes?", focus: "nav-notes", steps: ["Open a note and switch from Type to Draw.", "Use the pen, highlighter, shapes or eraser — stylus, finger or mouse.", "Draw a rough circle or arrow, then tap clean up to make it neat."] },
  { q: "How does the Notes AI Assistant work?", focus: "nav-notes", steps: ["Tap ✨ AI Assistant in a note.", "Spelling fixes and feedback appear by themselves — Accept, Reject or Accept All.", "Use Quiz Me, Flashcards, Study Guide or Ask, then Insert into Notes if you want it."] },
  { q: "How do I use voice typing?", steps: ["Tap into any text box.", "Tap the 🎤 button and talk.", "Tap it again to stop. Works in Chrome, Edge and Safari."] },
  { q: "How do I share my notes?", steps: ["Open a note and tap Share note.", "The link is copied — send it to friends or Discord.", "They can read it and save a copy, or make a quiz or flashcards from it."] },
  { q: "How do I record a lecture?", steps: ["Open Lecture Notes (or the Lecture tab in a note's AI Assistant).", "Tap record, and stop when class ends.", "You get a transcript, notes, key points and flashcards. If it fails, tap Try again or save the audio."] },
  { q: "How do I make a quiz from my notes?", focus: "nav-quizzes", steps: ["Open Quizzes and pick a class.", "Tap Choose what to study and tick the notes or files you want, then tap X.", "Pick the number of questions and tap Make quiz."] },
  { q: "How do I create/use flashcards?", steps: ["Open Flashcards in the Study menu.", "Pick a class and click Make flashcards.", "Tap a card to flip it and mark if you knew it."] },
  { q: "How do I use the AI Tutor?", focus: "nav-tutor", steps: ["Open AI Tutor and pick your class.", "Type or 🎤 speak your question — you can attach files too.", "Answers use your class files and go in depth. Old chats are saved on the left."] },
  { q: "How do I track my grades?", steps: ["Open Grades in the menu.", "Add grade categories and their weights.", "Enter scores to see your current grade and what you need."] },
  { q: "What are SnapQuick, QuickVideo and AI Checker?", steps: ["SnapQuick: snap a photo of homework for step-by-step help.", "QuickVideo: paste a YouTube link to get notes and a quiz.", "AI Checker: see if writing sounds AI-made, and Humanize it (Pro)."] },
  { q: "How do I add my free AI key?", steps: ["Open Settings → AI key (or follow the setup screen).", "Tap Get my free key and copy it from Google.", "Paste it back in — AI tools then work for free."] },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const drag = useDraggable("studynova:drag-stuck");

  // Hide the Ask AI button while Help is open so they never overlap.
  useEffect(() => {
    if (open) document.body.dataset['help'] = "open";
    else delete document.body.dataset['help'];
    return () => { delete document.body.dataset['help']; };
  }, [open]);

  function go(focus?: string) {
    setOpen(false);
    window.setTimeout(() => startTour(focus), 250);
  }

  return (
    <>
      <Button
        data-tour="help"
        {...drag.dragProps}
        onClick={() => { if (!drag.wasDrag()) setOpen(true); }}
        variant="secondary"
        className="fixed bottom-[8.5rem] right-4 z-40 h-10 gap-1.5 rounded-full shadow-lg lg:bottom-7 lg:right-[10.5rem]"
      >
        <Lightbulb className="size-4" /> Stuck?
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto pt-[max(8rem,calc(env(safe-area-inset-top)+7rem))] sm:max-w-md sm:pt-6" closeClassName="top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] sm:top-4">
          <SheetHeader>
            <SheetTitle>💡 Help</SheetTitle>
          </SheetHeader>
          <Button className="mt-4 w-full gap-2" onClick={() => go()}>
            <PlayCircle className="size-4" /> SyllabusStudy 101 — Take the Tour Again
          </Button>
          <Accordion type="single" collapsible className="mt-4">
            {TOPICS.map((t) => (
              <AccordionItem key={t.q} value={t.q}>
                <AccordionTrigger className="text-left text-sm font-semibold">{t.q}</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {t.steps.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                  {t.focus ? (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => go(t.focus)}>
                      Show me
                    </Button>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SheetContent>
      </Sheet>
    </>
  );
}
