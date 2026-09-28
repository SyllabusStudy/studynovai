import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { TERMS_OF_SERVICE } from "@/content/legal";
import { LegalDocument } from "@/components/LegalDocument";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — StudyNova" },
      {
        name: "description",
        content: "The rules for using StudyNova: accounts, your content, AI features, email integrations and subscriptions.",
      },
      { property: "og:title", content: "Terms of Service — StudyNova" },
      { property: "og:description", content: "The rules for using StudyNova's study, AI and email features." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">StudyNova</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        <LegalDocument text={TERMS_OF_SERVICE} />
        <p className="mt-10 text-sm text-muted-foreground">
          See also our{" "}
          <Link to="/privacy" className="font-semibold text-primary">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
