import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Plug,
  Sparkles,
  Timer,
  UserRound,
  Zap,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getAiKeyStatus, saveAiKey } from "@/lib/ai-keys.functions";
import { guestReturnPath } from "@/lib/guest-gate";
import apiKeyTutorial from "@/assets/gemini-api-key-guide.mp4.asset.json";

export const Route = createFileRoute("/setup-ai")({
  head: () => ({
    meta: [
      { title: "Turn on AI — SyllabusStudy" },
      {
        name: "description",
        content:
          "Add your free Google Gemini key to unlock SyllabusStudy's tutor, flashcards, quizzes and photo scans.",
      },
      { property: "og:title", content: "Turn on AI — SyllabusStudy" },
      {
        property: "og:description",
        content: "A quick guided setup that turns on SyllabusStudy's AI study tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupAiPage,
});

const STEPS = [
  { icon: KeyRound, title: "Tap “Get my free key” below", text: "Sign in with Google if it asks." },
  { icon: UserRound, title: "Tap “Create API key”", text: "The blue button at the top of Google's page." },
  { icon: Plug, title: "Tap “Create key in new project”", text: "100% free — no credit card needed." },
  { icon: Clipboard, title: "Tap “Copy” and come right back", text: "Then paste it below and turn on AI." },
];

const BENEFITS = [
  { icon: Zap, title: "One-time setup", text: "Just add your free Google key." },
  { icon: Lock, title: "Safe & private", text: "We only use it to power your features." },
  { icon: Timer, title: "Quick & easy", text: "Takes less than 2 minutes." },
  { icon: Check, title: "Unlock all AI features", text: "Tutor, flashcards, quizzes and more." },
];

function SetupAiPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const status = useServerFn(getAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const html = document.documentElement;
    const hadTheme = html.classList.contains("app-theme");
    const hadDark = html.classList.contains("dark");
    html.classList.add("app-theme", "dark");
    return () => {
      if (!hadTheme) html.classList.remove("app-theme");
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data } = useQuery({
    queryKey: ["ai-key"],
    queryFn: () => status({ data: undefined }),
    enabled: !!user,
  });

  const nextPath = () => (guestReturnPath() ?? "/dashboard") as "/dashboard";

  useEffect(() => {
    if (!data?.hasKey) return;
    const t = setTimeout(() => navigate({ to: nextPath() }), 1200);
    return () => clearTimeout(t);
  }, [data?.hasKey, navigate]);

  const saving = useMutation({
    mutationFn: () => save({ data: { provider: "google", apiKey } }),
    onSuccess: () => {
      toast.success("AI is on — everything is ready to use.");
      navigate({ to: nextPath() });
    },
    onError: async (e: Error) => {
      if (e.message.includes("SESSION_EXPIRED")) {
        toast.error("Your sign-in expired. Please sign up or log in again.");
        await supabase.auth.signOut();
        navigate({ to: "/auth", search: { mode: "signup" } });
        return;
      }
      toast.error(e.message);
    },
  });

  const pasteKey = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setApiKey(text);
    } catch {
      toast.error("Couldn't read your clipboard — long-press the box and paste instead.");
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-40 -top-40 size-[28rem] rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-accent/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="font-display text-base font-bold tracking-tight">SyllabusStudy</span>
        </div>

        <header className="mt-6 text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            Turn on <span className="dash-gradient-text">AI</span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-xl">
            Get your free Google AI key and connect it in seconds.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the short video and you'll be ready to go!
          </p>
        </header>

        {data?.hasKey ? (
          <div className="dash-glass mx-auto mt-6 flex max-w-md items-center gap-3 rounded-2xl p-4">
            <CheckCircle2 className="size-5 text-primary" />
            <p className="text-sm font-semibold">AI is already on for your account. Taking you in…</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)] lg:items-start">
          <div className="dash-glass rounded-3xl p-2 sm:p-3 lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-2xl border border-border">
              <video
                className="aspect-video w-full bg-background"
                controls
                autoPlay
                muted
                playsInline
                preload="metadata"
                src={apiKeyTutorial.url}
                aria-label="Guide showing how to get a free Gemini API key for SyllabusStudy"
              >
                Your browser does not support video playback.
              </video>
            </div>
          </div>

          <div className="dash-glass rounded-3xl border border-primary/30 p-5 shadow-[0_0_40px_-12px_var(--primary)] sm:p-6">
            <ol className="relative">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="relative flex items-center gap-4 border-b border-border/60 py-3.5 last:border-b-0"
                >
                  {i < STEPS.length - 1 ? (
                    <span className="absolute left-[15px] top-[calc(50%+16px)] h-[calc(100%-32px)] w-px bg-primary/40" />
                  ) : null}
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/20 text-sm font-bold text-primary-foreground shadow-[0_0_14px_-2px_var(--primary)]">
                    {i + 1}
                  </span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <s.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <Button
              asChild
              variant="outline"
              className="mt-4 h-12 w-full gap-2 rounded-full border-primary/60 bg-transparent text-base font-semibold"
            >
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  if (window.innerWidth < 1024) return; // phones/tablets: normal tab
                  const sw = window.screen.availWidth;
                  const sh = window.screen.availHeight;
                  const w = Math.floor(sw / 2);
                  const left = (window.screen as Screen & { availLeft?: number }).availLeft ?? 0;
                  const top = (window.screen as Screen & { availTop?: number }).availTop ?? 0;
                  const popup = window.open(
                    "https://aistudio.google.com/apikey",
                    "syllabusstudy-gemini-key",
                    `popup=yes,width=${w},height=${sh},left=${left + sw - w},top=${top}`,
                  );
                  if (popup) {
                    e.preventDefault();
                    popup.focus();
                  }
                }}
              >
                Get my free key
                <ExternalLink className="size-4" />
              </a>
            </Button>
            <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
              Google never asks for a card or payment. Takes about 30 seconds.
            </p>

            <div className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-background/40 p-4">
              <Label htmlFor="setup-ai-key" className="text-sm font-bold">
                Paste your key here
              </Label>
              <div className="relative">
                <Input
                  id="setup-ai-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza…"
                  className="h-12 rounded-full pl-5 pr-12"
                />
                <button
                  type="button"
                  onClick={pasteKey}
                  aria-label="Paste key from clipboard"
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ClipboardPaste className="size-4" />
                </button>
              </div>
              <Button
                type="button"
                className="h-12 w-full gap-2 rounded-full bg-gradient-to-r from-primary to-accent text-base font-semibold shadow-[0_8px_30px_-8px_var(--primary)]"
                disabled={apiKey.trim().length < 12 || saving.isPending}
                onClick={() => saving.mutate()}
              >
                {saving.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {saving.isPending ? "Checking your key…" : "Turn on AI"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We check that it works before saving it. Only you can use it.
              </p>
            </div>

            <button
              type="button"
              className="mt-4 w-full text-xs font-semibold text-muted-foreground underline"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", search: { mode: "signup" } });
              }}
            >
              Use a different account
            </button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4 lg:divide-x lg:divide-border/60">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex items-center gap-3 lg:justify-center lg:px-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/15 shadow-[0_0_18px_-4px_var(--primary)]">
                <b.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">{b.title}</span>
                <span className="block text-xs text-muted-foreground">{b.text}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
