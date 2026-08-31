import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.enum(["google", "openai", "openrouter"]);

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
    z.object({ provider: providerSchema, apiKey: z.string().min(20).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_ai_keys").upsert(
      {
        user_id: context.userId,
        provider: data.provider,
        api_key: data.apiKey.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
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
