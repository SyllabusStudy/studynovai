import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { PRIVACY_POLICY } from "@/content/legal";
import { LegalDocument } from "@/components/LegalDocument";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SyllabusStudy" },
      {
        name: "description",
        content: "How SyllabusStudy collects, uses and protects student information, uploaded files and connected email accounts.",
      },
      { property: "og:title", content: "Privacy Policy — SyllabusStudy" },
      { property: "og:description", content: "How SyllabusStudy handles your academic information and connected accounts." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        <LegalDocument text={PRIVACY_POLICY} />
        <p className="mt-10 text-sm text-muted-foreground">
          See also our{" "}
          <Link to="/terms" className="font-semibold text-primary">
            Terms of Service
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
