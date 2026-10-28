import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SyllabusStudy — Built for college students" },
      {
        name: "description",
        content:
          "Why SyllabusStudy exists, who builds it, and how it turns syllabi, lectures, and notes into study plans, quizzes, and flashcards.",
      },
      { property: "og:title", content: "About SyllabusStudy" },
      { property: "og:description", content: "The story and mission behind SyllabusStudy, a study platform for college students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
      </header>
      <main className="prose-sm mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 text-foreground sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">About SyllabusStudy</h1>
        <p className="text-muted-foreground">Your semester, made simple.</p>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Why we built it</h2>
          <p>
            Every semester starts the same way: a stack of syllabi, a learning management system full of dates,
            lecture slides scattered across folders, and a vague plan to "start studying early." Most students
            don't fail because they lack effort — they lose track of what is due, when, and how to prepare for it.
            SyllabusStudy was created by a college student, David Sawaqed, to fix that problem in one place.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">What SyllabusStudy does</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Reads your syllabus and turns assignments and exams into a calendar with reminders.</li>
            <li>Syncs Canvas and Blackboard calendar feeds so deadlines stay current.</li>
            <li>Lets you take rich notes, draw diagrams, and record lectures inside each class.</li>
            <li>Turns notes and materials into practice quizzes, flashcards, and study guides.</li>
            <li>Explains homework step by step so you learn the method, not just the answer.</li>
            <li>Includes Glo, a voice study assistant that can create quizzes and tell you what's due.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Our approach to learning</h2>
          <p>
            Our tools are grounded in well-studied learning techniques: active recall, spaced repetition, and
            interleaved practice. We publish free, in-depth articles about these methods in our{" "}
            <Link to="/guides" className="font-semibold text-primary">study guides</Link>, so anyone can use them —
            with or without an account.
          </p>
          <p>
            We take academic integrity seriously. SyllabusStudy is designed to help you understand course material
            and prepare for exams, not to submit work that isn't yours.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Free and Pro</h2>
          <p>
            Core organization tools are free. Free accounts include trial AI generations and may show ads; Pro
            removes ads and unlocks unlimited AI tools. Read our{" "}
            <Link to="/privacy" className="font-semibold text-primary">Privacy Policy</Link> to see how your data is
            handled.
          </p>
        </section>

        <p>
          Questions or ideas? <Link to="/contact" className="font-semibold text-primary">Contact us</Link>.
        </p>
      </main>
    </div>
  );
}
