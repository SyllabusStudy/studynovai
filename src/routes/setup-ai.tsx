import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";
import { getAiKeyStatus, saveAiKey } from "@/lib/ai-keys.functions";
import apiKeyTutorial from "@/assets/gemini-api-key-guide.mp4.asset.json";

export const Route = createFileRoute("/setup-ai")({
  head: () => ({
    meta: [
      { title: "Turn on AI — StudyNova" },
      {
        name: "description",
        content:
          "Add your free Google Gemini key to unlock StudyNova's tutor, flashcards, quizzes and photo scans.",
      },
      { property: "og:title", content: "Turn on AI — StudyNova" },
      {
        property: "og:description",
        content: "A quick guided setup that turns on StudyNova's AI study tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupAiPage,
});

const STEPS = [
  "Tap Get my free key — Google AI Studio opens in a new tab.",
  "Sign in with your Google account and tap Create API key.",
  "Copy the key (it starts with AIza) and come back here.",
  "Paste it below and tap Turn on AI.",
];

function SetupAiPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const status = useServerFn(getAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data } = useQuery({
    queryKey: ["ai-key"],
    queryFn: () => status({ data: undefined }),
    enabled: !!user,
  });

  useEffect(() => {
    if (!data?.hasKey) return;
    const t = setTimeout(() => navigate({ to: "/dashboard" }), 1200);
    return () => clearTimeout(t);
  }, [data?.hasKey, navigate]);

  const saving = useMutation({
    mutationFn: () => save({ data: { provider: "google", apiKey } }),
    onSuccess: () => {
      toast.success("AI is on — everything is ready to use.");
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">StudyNova</span>
        </div>

        <div className="mt-6 max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">One quick step: turn on AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            StudyNova's tutor, flashcards, quizzes, photo scans and video notes run on your own free
            Google key, so your studying stays on your account. Watch the guide and follow along — it
            takes about a minute.
          </p>
        </div>

        {data?.hasKey ? (
          <div className="surface-card mt-6 flex items-center gap-3 p-5">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <p className="text-sm font-semibold">AI is already on for your account. Taking you in…</p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          {/* Video stays visible while they get the key */}
          <div className="surface-card overflow-hidden p-0 lg:sticky lg:top-6">
            <video
              className="aspect-video w-full bg-black"
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              src={apiKeyTutorial.url}
              aria-label="Guide showing how to get a free Gemini API key for StudyNova"
            >
              Your browser does not support video playback.
            </video>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Keep this playing while you grab your key — it shows every screen you'll see.
            </p>
          </div>

          <div className="space-y-5">
            <ol className="surface-card space-y-2.5 p-5 text-sm">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>

            <Button asChild variant="outline" className="w-full gap-2">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Get my free key
              </a>
            </Button>

            <div className="surface-card space-y-3 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="setup-ai-key">Paste your key here</Label>
                <Input
                  id="setup-ai-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza…"
                />
                <p className="text-xs text-muted-foreground">
                  We check that it works before saving it. Only you can use it.
                </p>
              </div>
              <Button
                type="button"
                className="w-full gap-2"
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
            </div>

            <button
              type="button"
              className="w-full text-sm font-semibold text-muted-foreground underline"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              I'll set this up later
            </button>
            <p className="text-center text-xs text-muted-foreground">
              You can always add it from Settings → AI key.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
