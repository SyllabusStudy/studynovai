import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AI_KEY_HELP } from "./ai-messages";
export { AI_KEY_HELP } from "./ai-messages";

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

/** True when the student has saved their own key (no throw). */
export async function hasUserAiKey(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_ai_keys")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.api_key);
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

export type TrialBucket = "tools" | "tutor";
export const TRIAL_LIMITS: Record<TrialBucket, number> = { tools: 3, tutor: 2 };

/** Remaining free trial uses per bucket (never exposes the shared key). */
export async function getTrialRemaining(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Record<TrialBucket, number>> {
  const { data } = await supabase.from("ai_trial_uses").select("bucket,used").eq("user_id", userId);
  const used = (b: TrialBucket) => data?.find((r) => r.bucket === b)?.used ?? 0;
  return {
    tools: Math.max(0, TRIAL_LIMITS.tools - used("tools")),
    tutor: Math.max(0, TRIAL_LIMITS.tutor - used("tutor")),
  };
}

function trialKey(): AiKeyConfig | null {
  const key = process.env["TRIAL_GEMINI_API_KEY"];
  return key ? { provider: "google", key } : null;
}

/** True when the student has their own key or a free trial use left in this bucket. */
export async function canUseAi(
  supabase: SupabaseClient<Database>,
  userId: string,
  bucket: TrialBucket,
): Promise<boolean> {
  if (await hasUserAiKey(supabase, userId)) return true;
  if (!trialKey()) return false;
  return (await getTrialRemaining(supabase, userId))[bucket] > 0;
}

/**
 * Uses the student's own key when saved; otherwise spends one free trial use
 * (tracked server-side) on the shared trial key. `consume=false` lets helper
 * steps of an already-counted action run without spending another use.
 */
export async function withTrialOrUserAiKey<T>(
  supabase: SupabaseClient<Database>,
  userId: string,
  bucket: TrialBucket,
  fn: () => Promise<T>,
  consume = true,
): Promise<T> {
  if (await hasUserAiKey(supabase, userId)) return withUserAiKey(supabase, userId, fn);
  const cfg = trialKey();
  if (!cfg) throw new Error(AI_KEY_HELP);
  if (consume) {
    const { data: ok } = await supabase.rpc("consume_ai_trial", { _bucket: bucket });
    if (!ok) throw new Error(AI_KEY_HELP);
  } else if ((await getTrialRemaining(supabase, userId))[bucket] <= 0) {
    throw new Error(AI_KEY_HELP);
  }
  return store.run(cfg, fn);
}

/** Runs a one-off provider check without persisting or exposing the credential. */
export async function withAiKeyConfig<T>(
  config: AiKeyConfig,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(config, fn);
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

/**
 * One model per provider, always the free-tier / cheapest option. No paid
 * fallback chain: if the free model is unavailable the request fails with a
 * plain message instead of quietly upgrading to a billed model.
 */
export function chatModel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1-nano";
    case "openrouter":
      // ":free" suffix — OpenRouter never bills these.
      return "meta-llama/llama-3.3-70b-instruct:free";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "deepseek":
      return "deepseek-chat";
    case "xai":
      return "grok-3-mini";
    case "mistral":
      return "mistral-small-latest";
    case "together":
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";
    case "perplexity":
      return "sonar";
    default:
      return "gemini-flash-lite-latest";
  }
}


/**
 * Keys are recognised by their shape, so a student who picks the wrong provider
 * in the dropdown still gets a working AI instead of "key was rejected".
 */
export function detectProvider(key: string): AiProvider | null {
  const k = key.trim();
  if (/^AIza/.test(k)) return "google";
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
  // The explicit Settings selection is authoritative. Prefixes are useful as
  // UI hints only: API-key formats overlap and providers can introduce new
  // formats, so guessing here can leak a credential to the wrong service.
  void key;
  return [stored];
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
    return { "x-goog-api-key": key };
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
