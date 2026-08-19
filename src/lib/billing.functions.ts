import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBilling } = await import("./billing.server");
    return loadBilling(context.supabase, context.userId);
  });

export const startProCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { startCheckout } = await import("./billing.server");
    return startCheckout(context.userId, data.origin.replace(/\/$/, ""));
  });

export const confirmProCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subscriptionId: z.string().min(3).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { syncSubscription } = await import("./billing.server");
    return syncSubscription(context.userId, data.subscriptionId);
  });

export const cancelProPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { cancelPro } = await import("./billing.server");
    return cancelPro(context.supabase, context.userId);
  });

export const redeemPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { redeemPromoCode } = await import("./billing.server");
    return redeemPromoCode(context.userId, data.code);
  });
