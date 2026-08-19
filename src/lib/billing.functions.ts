import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const envSchema = z.enum(["sandbox", "live"]);

export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBilling } = await import("./billing.server");
    return loadBilling(context.supabase, context.userId);
  });

export const startProCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        environment: envSchema,
        priceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        returnUrl: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { startCheckout } = await import("./billing.server");
    const {
      data: { user },
    } = await context.supabase.auth.getUser();
    return startCheckout({
      environment: data.environment,
      userId: context.userId,
      priceId: data.priceId,
      returnUrl: data.returnUrl,
      ...(user?.email ? { email: user.email } : {}),
    });
  });

export const confirmProCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ environment: envSchema, sessionId: z.string().min(3).max(200) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { syncCheckoutSession } = await import("./billing.server");
    return syncCheckoutSession(data.environment, context.userId, data.sessionId);
  });

export const cancelProPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ environment: envSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelPro } = await import("./billing.server");
    return cancelPro(context.supabase, context.userId, data.environment);
  });

export const redeemPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { redeemPromoCode } = await import("./billing.server");
    return redeemPromoCode(context.userId, data.code);
  });
