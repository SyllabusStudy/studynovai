import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const envSchema = z.enum(["sandbox", "live"]);

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { isAdmin } = await import("./admin.server");
  if (!(await isAdmin(supabase, userId))) throw new Error("This page is for the site owner only.");
}

export const getPricingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { loadPricing, listPromoCodes } = await import("./pricing.server");
    const [pricing, codes] = await Promise.all([loadPricing(), listPromoCodes()]);
    return { pricing, codes };
  });

const pricingInput = z.object({
  environment: envSchema,
  priceUsd: z.number().min(0.5).max(999),
  comparePriceUsd: z.number().min(0.5).max(999).nullable(),
  saleActive: z.boolean(),
  saleLabel: z.string().max(60),
  saleNote: z.string().max(160).nullable(),
});

export const saveProPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pricingInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { savePricing } = await import("./pricing.server");
    return savePricing(context.userId, data.environment, {
      priceUsd: data.priceUsd,
      comparePriceUsd: data.comparePriceUsd,
      saleActive: data.saleActive,
      saleLabel: data.saleLabel.trim() || "Limited-time offer",
      saleNote: data.saleNote?.trim() || null,
    });
  });

const codeInput = z.object({
  environment: envSchema,
  code: z.string().min(3).max(40),
  label: z.string().max(80).nullable(),
  kind: z.enum(["free_pro", "percent"]),
  percentOff: z.number().int().min(1).max(100).nullable(),
  maxRedemptions: z.number().int().min(1).max(100000).nullable(),
  expiresAt: z.string().nullable(),
});

export const addPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => codeInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { createPromoCode } = await import("./pricing.server");
    return createPromoCode(context.userId, data.environment, {
      code: data.code,
      label: data.label?.trim() || null,
      kind: data.kind,
      percentOff: data.percentOff,
      maxRedemptions: data.maxRedemptions,
      expiresAt: data.expiresAt,
    });
  });

export const togglePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { setPromoCodeActive } = await import("./pricing.server");
    return setPromoCodeActive(data.id, data.active);
  });

export const removePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { deletePromoCode } = await import("./pricing.server");
    return deletePromoCode(data.id);
  });
