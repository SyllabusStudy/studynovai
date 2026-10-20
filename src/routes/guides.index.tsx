import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { AdBanner } from "@/components/AdBanner";
import { GUIDES } from "@/content/guides";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title: "Free College Study Guides — SyllabusStudy" },
      {
        name: "description",
        content:
          "Free, in-depth college study guides: syllabus planning, active recall, STEM problem-solving, note-taking systems and a 7-day midterm plan.",
      },
      { property: "og:title", content: "Free College Study Guides — SyllabusStudy" },
      {
        property: "og:description",
        content: "Practical, research-backed guides to studying smarter in college.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://syllabusstudy.com/guides" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://syllabusstudy.com/guides" }],
  }),
  component: GuidesIndex,
});

function GuidesIndex() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">College Study Guides</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Free, practical guides to planning your semester, studying with proven techniques and walking into exams
          prepared.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              to="/guides/$slug"
              params={{ slug: g.slug }}
              className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                {g.category} · {g.readMinutes} min read
              </div>
              <h2 className="mt-2 text-lg font-bold leading-snug">{g.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10">
          <AdBanner />
        </div>
      </main>
    </div>
  );
}
