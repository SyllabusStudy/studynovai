import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AiProvider = "google" | "openai" | "openrouter";

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
  const provider = (["google", "openai", "openrouter"] as const).includes(
    data.provider as AiProvider,
  )
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
    default:
      return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
}

export function chatModel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1-mini";
    case "openrouter":
      return "google/gemini-2.5-flash";
    default:
      return "gemini-2.5-flash";
  }
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  google: "Google AI Studio (Gemini)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

export const PROVIDER_HELP: Record<AiProvider, string> = {
  google: "Free key from aistudio.google.com/apikey — starts with AIza.",
  openai: "Key from platform.openai.com/api-keys — starts with sk-.",
  openrouter: "Key from openrouter.ai/keys — starts with sk-or-.",
};
