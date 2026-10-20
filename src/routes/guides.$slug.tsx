import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { AdBanner } from "@/components/AdBanner";
import { GUIDES, getGuide } from "@/content/guides";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => {
    const guide = getGuide(params.slug);
    if (!guide) throw notFound();
    return { guide };
  },
  head: ({ params, loaderData }) => {
    const url = `https://syllabusstudy.com/guides/${params.slug}`;
    if (!loaderData) {
      return { meta: [{ title: "Guide not found — SyllabusStudy" }, { name: "robots", content: "noindex" }] };
    }
    const g = loaderData.guide;
    return {
      meta: [
        { title: `${g.title} — SyllabusStudy` },
        { name: "description", content: g.description },
        { property: "og:title", content: g.title },
        { property: "og:description", content: g.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: g.title,
            description: g.description,
            mainEntityOfPage: url,
            publisher: { "@type": "Organization", name: "SyllabusStudy" },
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="p-10 text-center">
      Guide not found.{" "}
      <Link to="/guides" className="text-primary">
        See all guides
      </Link>
    </div>
  ),
  component: GuidePage,
});

function GuidePage() {
  const { guide } = Route.useLoaderData();
  const others = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
        <Link to="/guides" className="text-sm font-semibold text-primary">
          All guides
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        <article>
          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-primary">
            {guide.category} · {guide.readMinutes} min read
          </div>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{guide.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{guide.intro}</p>

          <nav className="mt-8 rounded-2xl border border-border bg-card p-5">
            <div className="text-sm font-bold">In this guide</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {guide.sections.map((s, i) => (
                <li key={s.heading}>
                  <a href={`#s${i}`} className="hover:text-foreground">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {guide.sections.map((s, i) => (
            <section key={s.heading} id={`s${i}`} className="mt-10 scroll-mt-6">
              <h2 className="text-2xl font-bold tracking-tight">{s.heading}</h2>
              {s.paragraphs.map((p, j) => (
                <p key={j} className="mt-4 leading-relaxed">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul className="mt-4 list-disc space-y-1.5 pl-6 leading-relaxed">
                  {s.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {i === 2 && (
                <div className="mt-8">
                  <AdBanner />
                </div>
              )}
            </section>
          ))}

          <section className="mt-12 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Key takeaways</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              {guide.takeaways.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </article>

        <section className="mt-12">
          <h2 className="text-lg font-bold">More study guides</h2>
          <div className="mt-4 grid gap-3">
            {others.map((g) => (
              <Link
                key={g.slug}
                to="/guides/$slug"
                params={{ slug: g.slug }}
                className="rounded-xl border border-border bg-card p-4 font-semibold hover:border-primary"
              >
                {g.title}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
