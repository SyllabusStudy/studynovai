import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Brain,
  CalendarCheck,
  ChartColumn,
  ClipboardList,
  FileText,
  FolderOpen,
  Layers,
  Moon,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallAppButton } from "@/components/InstallAppButton";
import { TryItTools } from "@/components/TryItTools";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const HUB = [
  { label: "Classes", to: "/classes", icon: BookOpen },
  { label: "Calendar", to: "/calendar", icon: CalendarCheck },
  { label: "Assignments", to: "/assignments", icon: ClipboardList },
  { label: "Notes", to: "/lectures", icon: NotebookPen },
  { label: "Flashcards", to: "/flashcards", icon: Layers },
  { label: "AI Tutor", to: "/tutor", icon: Bot },
  { label: "Grades", to: "/grades", icon: ChartColumn },
  { label: "Study Materials", to: "/studio", icon: FolderOpen },
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Syllabus Study — Your Whole Classes, From One Syllabus" },
      {
        name: "description",
        content:
          "Syllabus Study is an AI study assistant for college students. Upload your syllabus to organize your classes, deadlines and study materials, then study with AI flashcards, quizzes and a tutor.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Syllabus Study — Your Whole Classes, From One Syllabus" },
      {
        property: "og:description",
        content:
          "Upload your syllabus, get an instant semester calendar, AI flashcards and quizzes, and a tutor grounded in your own notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://syllabusstudy.com/share-card.jpg" },
      { name: "twitter:image", content: "https://syllabusstudy.com/share-card.jpg" },
      { property: "og:url", content: "https://syllabusstudy.com/" },
      { property: "og:site_name", content: "Syllabus Study" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Syllabus Study",
          url: "https://syllabusstudy.com/",
          applicationCategory: "EducationalApplication",
          operatingSystem: "Web",
          description:
            "AI study assistant and study planner for college students that turns a syllabus into a semester calendar, flashcards, quizzes and an AI tutor.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
    links: [{ rel: "canonical", href: "https://syllabusstudy.com/" }],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: FileText,
    title: "Syllabus in, semester out",
    body: "Upload a syllabus PDF or a photo of one. SyllabusStudy reads the policies, grading breakdown and every date, then builds your calendar.",
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

  // Same navy glass look as the signed-in Home dashboard.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("app-theme");
    el.classList.toggle("dark", theme === "dark");
    return () => { el.classList.remove("app-theme"); };
  }, [theme]);

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/60 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <BrandLogo />
        <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Log in</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </div></header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 sm:pt-14">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 dash-glass rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Built for real coursework
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Your <span className="text-gradient-brand">AI-powered</span> college companion.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Turn your coursework into notes, quizzes, flashcards, study guides, and more — all in one
            place. Syllabus Study is the AI study assistant that turns your syllabus into a study plan.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2 rounded-full shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_50%,transparent)]">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your free account <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="dash-glass rounded-full">
              <a href="#try-it">Try SyllabusStudy</a>
            </Button>
            <InstallAppButton className="gap-2" />
          </div>
        </div>
      </section>

      <TryItTools />

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          One place for everything
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Your whole semester, already connected — no spreadsheets, no scattered apps.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HUB.map((h) => (
            <Link
              key={h.label}
              to={h.to}
              className="dash-glass group flex items-center gap-3 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-pop)]"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <h.icon className="size-4" />
              </span>
              <span className="text-sm font-semibold tracking-tight">{h.label}</span>
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="dash-glass animate-fade-up p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-bold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>

        <div className="dash-glass mt-14 shadow-[0_0_40px_-10px_var(--primary)] flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your entire semester, in one place.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organize your classes. Study with AI. Stay ahead.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0 gap-2">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started for free <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-background/40 py-8 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-xs text-muted-foreground sm:px-6">
          <p>
            SyllabusStudy — your AI-powered college companion. Organize classes, syllabi, assignments,
            deadlines and grades, and study with an AI tutor built on your own course materials.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-4 font-semibold">
            <Link to="/calendar" className="hover:text-foreground">
              Free Study Schedule Generator
            </Link>
            <Link to="/quickvideo" className="hover:text-foreground">
              AI Video Summarizer
            </Link>
            <Link to="/flashcards" className="hover:text-foreground">
              AI Flashcard Maker
            </Link>
            <Link to="/guides" className="hover:text-foreground">
              Study Guides
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
