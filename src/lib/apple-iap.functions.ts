import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncApplePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jws: z.string().min(20).max(20000) }).parse(d))
  .handler(async ({ context, data }) => {
    const { applyAppleTransaction } = await import("./apple-iap.server");
    try {
      return await applyAppleTransaction(context.userId, data.jws);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not verify the purchase." };
    }
  });
