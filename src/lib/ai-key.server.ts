import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const AI_PROVIDERS = [
  "google",
  "openai",
  "openrouter",
  "anthropic",
  "groq",
  "deepseek",
  "xai",
  "mistral",
  "together",
  "perplexity",
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiKeyConfig = { provider: AiProvider; key: string };

export const AI_KEY_HELP =
  "Add your own AI API key in Settings → AI key to use the AI features.";

/**
 * Per-request holder for the student's own AI key. Every AI call reads it from
 * here so no request ever falls back to the workspace's shared AI credits.
 */
const store = new AsyncLocalStorage<AiKeyConfig>();

export function getAiKey(): AiKeyConfig | undefined {
  return store.getStore();
}

export function requireAiKey(): AiKeyConfig {
  const cfg = store.getStore();
  if (!cfg) throw new Error(AI_KEY_HELP);
  return cfg;
}

export async function loadUserAiKey(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AiKeyConfig> {
  const { data } = await supabase
    .from("user_ai_keys")
    .select("provider,api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.api_key) throw new Error(AI_KEY_HELP);
  const provider = AI_PROVIDERS.includes(data.provider as AiProvider)
    ? (data.provider as AiProvider)
    : "google";
  return { provider, key: data.api_key };
}

/** Runs `fn` with the caller's own AI key available to every nested AI call. */
export async function withUserAiKey<T>(
  supabase: SupabaseClient<Database>,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cfg = await loadUserAiKey(supabase, userId);
  return store.run(cfg, fn);
}

/** Chat endpoint + model naming per provider (all OpenAI-compatible). */
export function chatEndpoint(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/chat/completions";
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "deepseek":
      return "https://api.deepseek.com/chat/completions";
    case "xai":
      return "https://api.x.ai/v1/chat/completions";
    case "mistral":
      return "https://api.mistral.ai/v1/chat/completions";
    case "together":
      return "https://api.together.xyz/v1/chat/completions";
    case "perplexity":
      return "https://api.perplexity.ai/chat/completions";
    default:
      return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
}

export function chatModel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1-mini";
    case "openrouter":
      return "openrouter/auto";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "deepseek":
      return "deepseek-chat";
    case "xai":
      return "grok-3-mini";
    case "mistral":
      return "mistral-small-latest";
    case "together":
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    case "perplexity":
      return "sonar";
    default:
      return "gemini-flash-latest";
  }
}

/**
 * Keys are recognised by their shape, so a student who picks the wrong provider
 * in the dropdown still gets a working AI instead of "key was rejected".
 */
export function detectProvider(key: string): AiProvider | null {
  const k = key.trim();
  if (/^(AIza|AQ\.)/.test(k)) return "google";
  if (/^sk-or-/.test(k)) return "openrouter";
  if (/^sk-ant-/.test(k)) return "anthropic";
  if (/^gsk_/.test(k)) return "groq";
  if (/^xai-/.test(k)) return "xai";
  if (/^pplx-/.test(k)) return "perplexity";
  if (/^sk-/.test(k)) return "openai";
  return null;
}

/**
 * Providers to try for this key, best guess first. Ambiguous keys (bare hex
 * strings, sk-... which several providers use) fall through to the rest.
 */
export function candidateProviders(stored: AiProvider, key: string): AiProvider[] {
  const detected = detectProvider(key);
  // Only provider-specific prefixes are authoritative. A generic `sk-` key is
  // used by several vendors, so keep the student's selected provider instead
  // of incorrectly sending it to OpenAI first. Never spray a private key at
  // every provider endpoint.
  const specific = detected && detected !== "openai" ? detected : null;
  return [specific ?? stored];
}

/** Correct auth headers per provider (Anthropic does not use Bearer tokens). */
export function authHeaders(provider: AiProvider, key: string): Record<string, string> {
  if (provider === "anthropic") {
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    };
  }
  if (provider === "google") {
    return { Authorization: `Bearer ${key}`, "x-goog-api-key": key };
  }
  return { Authorization: `Bearer ${key}` };
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  google: "Google AI Studio (Gemini)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  anthropic: "Anthropic (Claude)",
  groq: "Groq",
  deepseek: "DeepSeek",
  xai: "xAI (Grok)",
  mistral: "Mistral AI",
  together: "Together AI",
  perplexity: "Perplexity",
};

export const PROVIDER_HELP: Record<AiProvider, string> = {
  google: "Free key from aistudio.google.com/apikey — starts with AIza.",
  openai: "Key from platform.openai.com/api-keys — starts with sk-.",
  openrouter: "Key from openrouter.ai/keys — starts with sk-or-.",
  anthropic: "Key from console.anthropic.com — starts with sk-ant-.",
  groq: "Free fast key from console.groq.com/keys — starts with gsk_.",
  deepseek: "Key from platform.deepseek.com — very low cost.",
  xai: "Key from console.x.ai — starts with xai-.",
  mistral: "Key from console.mistral.ai — free tier available.",
  together: "Key from api.together.ai/settings/api-keys.",
  perplexity: "Key from perplexity.ai/settings/api — answers include web search.",
};
