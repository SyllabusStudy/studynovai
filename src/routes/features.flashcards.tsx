import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Camera, FileText, ListChecks, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

const TITLE = "Make College a Little Easier — AI Flashcards from Your Own Notes";
const DESCRIPTION =
  "Turn your syllabus, lecture PDFs and homework into flashcards in seconds. SyllabusStudy builds titled decks from your own course materials, then quizzes you on the cards you keep missing.";
const URL = "https://studymateaicollege.lovable.app/features/flashcards";

export const Route = createFileRoute("/features/flashcards")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
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
          name: "SyllabusStudy",
          applicationCategory: "EducationalApplication",
          operatingSystem: "Web",
          description: DESCRIPTION,
          url: URL,
          offers: [
            { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
            { "@type": "Offer", name: "Pro", price: "20", priceCurrency: "USD" },
          ],
        }),
      },
    ],
  }),
  component: FlashcardsFeature,
});

const STEPS = [
  {
    icon: FileText,
    title: "Drop in what you already have",
    body: "Upload a syllabus, a lecture PDF or a chapter scan. SyllabusStudy reads it and pulls out the terms, definitions and dates that actually matter.",
  },
  {
    icon: Brain,
    title: "Get a titled deck, not a pile",
    body: "Every generation lands in its own named deck, so Bio 101 Chapter 4 never mixes with last week's stats cards. Review or delete a deck in one tap.",
  },
  {
    icon: ListChecks,
    title: "Match your homework",
    body: "Pick an assignment and the cards are built around that exact problem set and due date, so studying and homework stop being two separate jobs.",
  },
  {
    icon: Camera,
    title: "SnapQuick from your phone",
    body: "Take a picture of a worksheet or whiteboard and get cards from it on the spot — no typing, no retyping notes at midnight.",
  },
  {
    icon: Timer,
    title: "Fast, plain answers",
    body: "No symbol soup, no filler. Cards and explanations come back in seconds, written the way a good classmate would say it.",
  },
  {
    icon: Sparkles,
    title: "It remembers you",
    body: "SyllabusStudy keeps track of your classes, weak topics and past questions, so each deck and quiz gets a little more useful than the last.",
  },
];

function FlashcardsFeature() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
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

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Brain className="size-3.5 text-primary" /> AI flashcards from your own course materials
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Make college a <span className="text-gradient-brand">little easier</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            SyllabusStudy turns your syllabus, lecture PDFs and homework into flashcard decks you can actually
            study from — grounded in your real class material instead of a stranger's deck.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth" search={{ mode: "signup" }}>
                Make my first deck free <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/">See everything SyllabusStudy does</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free plan: unlimited classes, 4 AI assignment helps, 5 SnapQuick scans and 2 QuickVideo imports every 4 hours. Pro is
            $5.99/month for unlimited AI usage.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <article key={s.title} className="surface-card animate-fade-up p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <s.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-bold tracking-tight">{s.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight">How flashcard generation works</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">1. Add a class.</strong> Upload the syllabus and SyllabusStudy
              fills in the course code, meeting times, exams and deadlines for you.
            </li>
            <li>
              <strong className="text-foreground">2. Upload your material.</strong> Chapter PDFs, slide decks,
              handwritten notes or a phone photo all work.
            </li>
            <li>
              <strong className="text-foreground">3. Choose a scope.</strong> Generate from a whole document or
              tie the deck to one assignment so the cards match what's due.
            </li>
            <li>
              <strong className="text-foreground">4. Review.</strong> Flip through the deck, mark what you knew,
              and SyllabusStudy keeps surfacing the cards you keep missing.
            </li>
          </ol>
        </div>

        <div className="surface-card mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your next exam is already on the syllabus</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload it once and start studying from cards built out of your own class.
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
        SyllabusStudy — your AI-powered college companion.
      </footer>
    </div>
  );
}
