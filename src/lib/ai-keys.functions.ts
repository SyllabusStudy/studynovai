import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.enum([
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
]);

/** Whether the student has stored their own AI key (never returns the key itself). */
export const getAiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_ai_keys")
      .select("provider,api_key,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data?.api_key) return { hasKey: false as const, provider: null, hint: null, updatedAt: null };
    return {
      hasKey: true as const,
      provider: data.provider,
      hint: `${data.api_key.slice(0, 6)}…${data.api_key.slice(-4)}`,
      updatedAt: data.updated_at,
    };
  });

export const saveAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ provider: providerSchema, apiKey: z.string().min(12).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = data.apiKey.trim();
    const [{ callAI }, { withAiKeyConfig }] = await Promise.all([
      import("./ai.server"),
      import("./ai-key.server"),
    ]);
    await withAiKeyConfig({ provider: data.provider, key: apiKey }, () =>
      callAI(
        [{ role: "user", content: "Reply with OK." }],
        { maxTokens: 8, temperature: 0 },
      ),
    );
    const { error } = await context.supabase.from("user_ai_keys").upsert(
      {
        user_id: context.userId,
        provider: data.provider,
        api_key: apiKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (error.code === "23503" || /foreign key/i.test(error.message)) {
        throw new Error("SESSION_EXPIRED: Your sign-in expired. Please sign up or log in again.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("user_ai_keys")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
