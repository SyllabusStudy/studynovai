import { useEffect, useState } from "react";
import { Lightbulb, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { startTour } from "@/lib/tour";

const TOPICS: { q: string; steps: string[]; focus?: string }[] = [
  { q: "How do I add a class?", focus: "add-class", steps: ["Go to your dashboard.", "Click + Add Class.", "Type the class name and details, then save."] },
  { q: "How do I upload a syllabus?", focus: "add-class", steps: ["Click Upload Syllabus on the dashboard.", "Open a class and add your syllabus PDF or photo.", "SyllabusStudy finds the dates and puts them on your calendar."] },
  { q: "How do I use the calendar?", focus: "nav-calendar", steps: ["Click Calendar in the menu.", "Use the filters to show only exams, assignments and more.", "Click a day to add an event."] },
  { q: "How do I use the AI Tutor?", focus: "nav-tutor", steps: ["Click Ask AI Tutor.", "Pick your class at the top.", "Ask a question — answers use your own class files."] },
  { q: "How do I create/use flashcards?", focus: "nav-flashcards", steps: ["Open Flashcards in the Study menu.", "Pick a class and click Make flashcards.", "Tap a card to flip it and mark if you knew it."] },
  { q: "How do I track my grades?", focus: "nav-grades", steps: ["Open Grades in the menu.", "Add grade categories and their weights.", "Enter scores to see your current grade and what you need."] },
  { q: "How do I use the study tools?", focus: "nav-flashcards", steps: ["Quizzes: make a practice test from your notes.", "SnapQuick: snap a photo of homework for help.", "QuickVideo: turn a lecture video into study notes."] },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);

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
        onClick={() => setOpen(true)}
        variant="secondary"
        className="fixed bottom-21 right-[9.5rem] z-40 h-10 gap-1.5 rounded-full shadow-lg lg:bottom-7 lg:right-[10.5rem]"
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
