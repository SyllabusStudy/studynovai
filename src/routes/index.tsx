import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  Bot,
  Brain,
  CalendarCheck,
  ChartColumn,
  FileText,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyMate AI – AI Study Assistant for College Students" },
      {
        name: "description",
        content:
          "Upload your syllabus, get an instant semester calendar, AI-generated flashcards and quizzes, and a tutor that answers from your own course materials.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "StudyMate AI – AI Study Assistant for College Students" },
      {
        property: "og:description",
        content:
          "Upload your syllabus, get an instant semester calendar, AI flashcards and quizzes, and a tutor grounded in your own notes.",
      },
    ],
    links: [{ rel: "canonical", href: "https://studymateaicollege.lovable.app/" }],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: FileText,
    title: "Syllabus in, semester out",
    body: "Upload a syllabus PDF or a photo of one. StudyMate reads the policies, grading breakdown and every date, then builds your calendar.",
  },
  {
    icon: Bot,
    title: "A tutor that read your notes",
    body: "Ask anything. Answers come from your own documents with a source line — and an honest \"that's not in your syllabus\" when it isn't.",
  },
  {
    icon: Brain,
    title: "Flashcards & quizzes on demand",
    body: "Turn any chapter into 10–50 flashcards or an exam-level quiz, with explanations and weak-topic detection.",
  },
  {
    icon: CalendarCheck,
    title: "Deadlines you can't miss",
    body: "Assignments, quizzes, exams and finals in month, week and day views, colour-coded per class with reminders.",
  },
  {
    icon: ChartColumn,
    title: "Know your grade",
    body: "Weighted categories, current grade, projections and exactly what you need on the final to hit your target.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Every file, note and conversation is locked to your account with row-level security. No shared buckets, no public links.",
  },
];

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <span className="text-sm font-extrabold tracking-tight">StudyMate AI</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-20">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Built for real coursework
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Your <span className="text-gradient-brand">AI-powered</span> college companion.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Keep every class, syllabus, PDF, deadline and grade in one calm workspace — and study with an AI
            tutor that actually knows your course materials.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your free account <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/features/flashcards">See AI flashcards</Link>
            </Button>
          </div>

        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="surface-card animate-fade-up p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <f.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-bold tracking-tight">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>

        <div className="surface-card mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Set up your semester in about five minutes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a class, drop in the syllabus, and let StudyMate handle the calendar, flashcards and study plan.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/auth" search={{ mode: "signup" }}>
              Start free
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        StudyMate AI — your AI-powered college companion.
      </footer>
    </div>
  );
}
