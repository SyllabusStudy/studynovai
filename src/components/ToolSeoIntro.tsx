import { Link } from "@tanstack/react-router";

const COPY: Record<string, { h1: string; intro: string; points: string[]; faq: [string, string][] }> = {
  "/quickvideo": {
    h1: "AI Video Summarizer: turn videos into study notes",
    intro:
      "QuickVideo turns YouTube videos and recorded lectures into clear, organized study notes. Paste a link or upload a video and SyllabusStudy writes a summary, key concepts and review questions in seconds.",
    points: [
      "Summarize YouTube lectures, tutorials and class recordings",
      "Get key concepts, definitions and timestamps-style outlines",
      "Save notes to a class and turn them into flashcards or quizzes",
      "Free to try, no download needed",
    ],
    faq: [
      ["Is the AI video summarizer free?", "Yes. You can try QuickVideo for free and create a free account to save your notes."],
      ["What videos can I summarize?", "Any public YouTube video with captions, or a video file you upload yourself."],
    ],
  },
  "/calendar": {
    h1: "Free Study Schedule Generator: turn your syllabus into a semester plan",
    intro:
      "Upload your syllabus and SyllabusStudy finds every assignment, quiz, exam and reading, then builds a color-coded semester calendar with reminders. You can also sync your Canvas or Blackboard calendar.",
    points: [
      "Reads syllabus PDFs and photos to pull out every due date",
      "Month, week and day views colour-coded by class",
      "Automatic reminders before exams, assignments and readings",
      "Sync Canvas and Blackboard calendars in one place",
    ],
    faq: [
      ["Is the study schedule generator free?", "Yes. Building your semester calendar from a syllabus is free."],
      ["Does it work with Canvas?", "Yes. Paste your Canvas or Blackboard calendar feed link to sync due dates."],
    ],
  },
};

export function hasToolSeoIntro(pathname: string) {
  return pathname in COPY;
}

/** Crawlable description of a public tool, shown to visitors who aren't signed in. */
export function ToolSeoIntro({ pathname }: { pathname: string }) {
  const c = COPY[pathname];
  if (!c) return null;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <section className="dash-glass mx-auto mt-10 max-w-4xl p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">{c.h1}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{c.intro}</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
        {c.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <h2 className="mt-6 text-lg font-bold">Questions</h2>
      {c.faq.map(([q, a]) => (
        <div key={q} className="mt-3">
          <h3 className="text-sm font-semibold">{q}</h3>
          <p className="text-sm text-muted-foreground">{a}</p>
        </div>
      ))}
      <p className="mt-6 text-sm">
        <Link to="/auth" search={{ mode: "signup" }} className="font-semibold text-primary hover:underline">
          Create your free SyllabusStudy account
        </Link>
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </section>
  );
}
