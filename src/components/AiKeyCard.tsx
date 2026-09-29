import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAiKey, getAiKeyStatus, saveAiKey } from "@/lib/ai-keys.functions";
import apiKeyTutorial from "@/assets/gemini-api-key-guide.mp4.asset.json";

type Provider =
  | "google"
  | "openai"
  | "openrouter"
  | "anthropic"
  | "groq"
  | "deepseek"
  | "xai"
  | "mistral"
  | "together"
  | "perplexity";

const PROVIDERS: Array<{ value: Provider; label: string; help: string; link: string }> = [
  {
    value: "google",
    label: "Google AI Studio (Gemini)",
    help: "Free tier available. Key starts with AIza. Best pick — also powers image tools.",
    link: "https://aistudio.google.com/apikey",
  },
  {
    value: "openai",
    label: "OpenAI",
    help: "Key starts with sk-. Needs billing on your OpenAI account.",
    link: "https://platform.openai.com/api-keys",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    help: "Key starts with sk-or-. One key for many models, plus image support.",
    link: "https://openrouter.ai/keys",
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    help: "Key starts with sk-ant-. Great for essays and long documents. No image generation.",
    link: "https://console.anthropic.com/settings/keys",
  },
  {
    value: "groq",
    label: "Groq",
    help: "Free and very fast (Llama 3.3). Key starts with gsk_. No image generation.",
    link: "https://console.groq.com/keys",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    help: "Very low cost per answer. No image generation.",
    link: "https://platform.deepseek.com/api_keys",
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    help: "Key starts with xai-. Fast Grok models. No image generation.",
    link: "https://console.x.ai",
  },
  {
    value: "mistral",
    label: "Mistral AI",
    help: "Free tier available. No image generation.",
    link: "https://console.mistral.ai/api-keys",
  },
  {
    value: "together",
    label: "Together AI",
    help: "Open models with free credits to start. No image generation.",
    link: "https://api.together.ai/settings/api-keys",
  },
  {
    value: "perplexity",
    label: "Perplexity",
    help: "Answers can include live web search. No image generation.",
    link: "https://www.perplexity.ai/settings/api",
  },
];

/** Lets each student store their own AI key so their usage is billed to them. */
export function AiKeyCard() {
  const qc = useQueryClient();
  const status = useServerFn(getAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const remove = useServerFn(deleteAiKey);
  const [provider, setProvider] = useState<Provider>("google");
  const [apiKey, setApiKey] = useState("");

  const { data } = useQuery({ queryKey: ["ai-key"], queryFn: () => status({ data: undefined }) });

  const saving = useMutation({
    mutationFn: () => save({ data: { provider, apiKey } }),
    onSuccess: async () => {
      setApiKey("");
      await qc.invalidateQueries({ queryKey: ["ai-key"] });
      toast.success("AI key verified and saved — AI features are ready");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removing = useMutation({
    mutationFn: () => remove({ data: undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai-key"] });
      toast.success("AI key removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = PROVIDERS.find((p) => p.value === provider)!;

  return (
    <section className="surface-card mb-4 space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/12 p-2 text-primary">
          <KeyRound className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">AI key</p>
          <p className="text-xs text-muted-foreground">
            StudyNova runs the AI on your own key, so every tutor answer, flashcard set, scan and
            video note is billed to your provider account — not to anyone else.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold">How to get your free Gemini API key</p>
          <p className="text-xs text-muted-foreground">Watch this quick guide, then paste your key below.</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
          <video
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            src={apiKeyTutorial.url}
            aria-label="Tutorial showing how to get a Gemini API key for StudyNova"
          >
            Your browser does not support video playback.
          </video>
        </div>
      </div>

      {data?.hasKey ? (
        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          Verified: <span className="font-semibold text-foreground">{data.provider}</span> ·{" "}
          {data.hint}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No key yet — AI features stay locked until you add one.
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {current.help}{" "}
          <a
            href={current.link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline"
          >
            Get a key
          </a>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-key">API key</Label>
        <Input
          id="ai-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your key"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={apiKey.trim().length < 12 || saving.isPending}
          onClick={() => saving.mutate()}
        >
          {saving.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
           {saving.isPending ? "Testing…" : data?.hasKey ? "Test & replace key" : "Test & save key"}
        </Button>
        {data?.hasKey ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={removing.isPending}
            onClick={() => removing.mutate()}
          >
            Remove key
          </Button>
        ) : null}
      </div>
    </section>
  );
}
