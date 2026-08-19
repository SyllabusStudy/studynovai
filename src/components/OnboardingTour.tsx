import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Bot, Camera, CheckSquare, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to StudyMate AI",
    body: "A quick tour so you know where everything lives. It takes about 30 seconds.",
  },
  {
    icon: BookOpen,
    title: "1. Import your syllabus",
    body: "Go to My Classes and drop in a syllabus PDF. StudyMate creates the class and fills your exams, homework and grade weights automatically.",
  },
  {
    icon: CheckSquare,
    title: "2. Attach work to assignments",
    body: "On any assignment, tap AI help to attach a PDF or screenshot. StudyMate reads it and walks you through the questions right there.",
  },
  {
    icon: Camera,
    title: "3. Use SnapQuick on your phone",
    body: "Take a picture of a worksheet or whiteboard and SnapQuick scans it, identifies every problem and explains each answer.",
  },
  {
    icon: Bot,
    title: "4. Study with your own materials",
    body: "The AI Tutor, Flashcards and Quizzes all pull from your uploaded documents, so answers match your actual course.",
  },
  {
    icon: Video,
    title: "5. Turn videos into notes",
    body: "Paste a YouTube link or upload a lecture recording in QuickVideo. StudyMate writes the notes for you, then answers any question about the video.",
  },
] as const;

export function OnboardingTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const storageKey = user ? `studymate-tour-${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    if (localStorage.getItem(storageKey) === "done") return;
    setOpen(true);
  }, [storageKey]);

  function finish() {
    if (storageKey) localStorage.setItem(storageKey, "done");
    setOpen(false);
  }

  const current = STEPS[step]!;
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-left">
            <Icon className="size-5 text-primary" />
            {current.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{current.body}</p>

        <div className="mt-2 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip
          </Button>
          {last ? (
            <Button size="sm" asChild onClick={finish}>
              <Link to="/classes">Import my syllabus</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
