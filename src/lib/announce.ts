/** Shared shape for owner announcement emails (safe to import anywhere). */
export type Draft = {
  subject: string;
  preview: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string | undefined;
  ctaUrl?: string | undefined;
};
