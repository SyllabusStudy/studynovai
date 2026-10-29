import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";

const EMAIL = "syllabusstudyteam@gmail.com";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact SyllabusStudy — Support and feedback" },
      { name: "description", content: "Get help with your SyllabusStudy account, report a problem, or send feedback to the team." },
      { property: "og:title", content: "Contact SyllabusStudy" },
      { property: "og:description", content: "Reach the SyllabusStudy team for support, privacy requests, or partnerships." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 text-foreground sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Contact us</h1>
        <p>
          We read every message. Email{" "}
          <a href={`mailto:${EMAIL}`} className="font-semibold text-primary">{EMAIL}</a> and we usually reply within
          two business days.
        </p>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Good things to include</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Account help:</strong> the email you signed up with.</li>
            <li><strong>Bug reports:</strong> what you clicked, what you expected, and your device or browser.</li>
            <li><strong>Privacy or deletion requests:</strong> you can also delete your account anytime in Settings.</li>
            <li><strong>Creators and partnerships:</strong> your channel link and audience.</li>
          </ul>
        </section>
        <p className="text-sm text-muted-foreground">
          See our <Link to="/privacy" className="font-semibold text-primary">Privacy Policy</Link>,{" "}
          <Link to="/terms" className="font-semibold text-primary">Terms of Service</Link>, or learn{" "}
          <Link to="/about" className="font-semibold text-primary">about SyllabusStudy</Link>.
        </p>
      </main>
    </div>
  );
}
