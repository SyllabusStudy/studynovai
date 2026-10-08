import { createFileRoute, Link } from "@tanstack/react-router";
import { MascotBot } from "@/components/ToolsMascot";

export const Route = createFileRoute("/glo")({
  head: () => ({
    meta: [
      { title: "Meet Glo — your voice study buddy | SyllabusStudy" },
      { name: "description", content: "What Glo can and can't do, how to turn him off, and how he learns your study style." },
      { property: "og:title", content: "Meet Glo — your voice study buddy | SyllabusStudy" },
      { property: "og:description", content: "What Glo can and can't do, how to turn him off, and how he learns your study style." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GloFaq,
});

const CAN = [
  ["📅 Tell you what's due", "“Hey Glo, what do I have due this week?”"],
  ["📝 Take notes for you", "“Hey Glo, make a note about the Krebs cycle.”"],
  ["🃏 Make flashcards", "“Hey Glo, make flashcards for biology chapter 3.”"],
  ["✍️ Build a quiz", "“Hey Glo, quiz me on my psych notes.”"],
  ["🧭 Open any tool", "“Hey Glo, open QuickVideo.”"],
  ["✉️ Draft emails", "He asks “Can I send this email?” before anything goes out."],
  ["🌙 Flip dark mode", "“Hey Glo, dark mode.”"],
  ["🔎 Answer questions", "Study questions or quick lookups, answered out loud."],
];

const CANT = [
  "He only works while the app is open — he can't hear you when it's closed.",
  "He never sends emails or deletes anything without asking you first.",
  "He can't see your screen or files you haven't uploaded to a class.",
  "He's a study buddy, not a search engine — for long research, use the Research tab in Notes AI.",
  "He needs microphone permission, and works best in Chrome, Edge, or Safari.",
];

function GloFaq() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-4">
        <MascotBot />
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Meet Glo 👋</h1>
          <p className="text-muted-foreground">Your blue voice buddy. Say “Hey Glo” anywhere in the app and he answers out loud.</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">What Glo can do</h2>
        <ul className="mt-3 space-y-2">
          {CAN.map(([t, d]) => (
            <li key={t} className="surface-card p-3">
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">What Glo can't do (yet)</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {CANT.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Turning him off (and back on)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap Glo on the right edge of any page, then tap <strong>“Hey Glo” on/off</strong>. Off means he stops listening
          completely — no microphone, no wake word. Tap it again anytime to bring him back. Your choice is remembered on that device.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Teaching him your study style</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Glo learns from how you use him in a conversation: tell him things like “keep answers short”, “explain like I'm five”,
          or “always bullet-point it”, and he'll follow that style for the rest of the chat. He also already knows your classes,
          your notes, and what's due — so answers are about <em>your</em> semester, not generic advice. More ways to personalize
          him are on the way.
        </p>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link to="/dashboard" className="font-semibold text-primary hover:underline">← Back to Home</Link>
      </p>
    </div>
  );
}
