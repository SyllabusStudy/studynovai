import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bell, CalendarCheck, ClipboardList, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";

const TITLE = "Free Study Schedule Generator — Turn Your Syllabus Into a Semester Plan | SyllabusStudy";
const DESCRIPTION =
  "Free study schedule generator for college students. Upload your syllabus and SyllabusStudy builds a semester calendar with every exam, quiz and assignment deadline, plus reminders.";
const URL = "https://syllabusstudy.com/features/study-schedule-generator";

export const Route = createFileRoute("/features/study-schedule-generator")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "SyllabusStudy Study Schedule Generator",
          applicationCategory: "EducationalApplication",
          operatingSystem: "Web",
          description: DESCRIPTION,
          url: URL,
          offers: { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: ScheduleGenerator,
});

const STEPS = [
  { icon: FileText, title: "Upload your syllabus", body: "Drop in a syllabus PDF or snap a photo of it. SyllabusStudy reads the course info, grading breakdown and every date." },
  { icon: CalendarCheck, title: "Get your semester calendar", body: "Exams, quizzes, assignments and finals land on a month, week and day calendar, colour-coded by class." },
  { icon: ClipboardList, title: "See what's due next", body: "Every deadline becomes a task you can check off, so you always know what to work on today." },
  { icon: Bell, title: "Reminders before it's due", body: "Pick when you want a heads-up and get notified on your phone or computer before each deadline." },
  { icon: RefreshCw, title: "Sync your school calendar", body: "Connect a Canvas or Blackboard calendar link to keep new assignments flowing in automatically." },
  { icon: Sparkles, title: "Study, not just schedule", body: "Turn the same class materials into flashcards, quizzes and notes when an exam is coming up." },
];

function ScheduleGenerator() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">Log in</Link></Button>
          <Button asChild size="sm"><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <CalendarCheck className="size-3.5 text-primary" /> Free study schedule generator
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Your syllabus, turned into a <span className="text-gradient-brand">study schedule</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Stop copying dates into a planner. Upload your syllabus and SyllabusStudy builds your whole semester —
            every exam, quiz and assignment — in one calendar, for free.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth" search={{ mode: "signup" }}>Build my schedule free <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/">See everything SyllabusStudy does</Link></Button>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <article key={s.title} className="surface-card animate-fade-up p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><s.icon className="size-5" /></span>
              <h2 className="mt-4 text-base font-bold tracking-tight">{s.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight">How to make a study schedule in 3 steps</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1. Create a free account</strong> and add your class.</li>
            <li><strong className="text-foreground">2. Upload the syllabus.</strong> Dates, exams and assignments are pulled out for you.</li>
            <li><strong className="text-foreground">3. Open your calendar.</strong> Check off tasks as you go and set reminders for what's next.</li>
          </ol>
        </div>

        <div className="surface-card mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Plan your whole semester in minutes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload one syllabus and see every deadline at once.</p>
          </div>
          <Button asChild size="lg" className="shrink-0"><Link to="/auth" search={{ mode: "signup" }}>Start free</Link></Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        SyllabusStudy — your AI-powered college companion.
      </footer>
    </div>
  );
}
