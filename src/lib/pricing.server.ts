/** Owner tools: change the Pro price, run a sale, and manage promo codes. */
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "./stripe.server";
import { mapPricing, type PricingRow, type PricingSettings } from "./pricing";
import { PRO_PRICE_ID } from "./stripe-price";

export type PromoCodeRow = {
  id: string;
  code: string;
  label: string | null;
  kind: string;
  percent_off: number | null;
  active: boolean;
  max_redemptions: number | null;
  redemptions: number;
  expires_at: string | null;
  created_at: string;
};

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadPricing(): Promise<PricingSettings> {
  const db = await admin();
  const { data } = await db
    .from("pricing_settings")
    .select("price_usd, compare_price_usd, sale_active, sale_label, sale_note")
    .maybeSingle();
  return mapPricing(data as PricingRow | null);
}

/** Points the Pro price lookup key at a new amount so checkout charges it. */
async function syncStripePrice(environment: StripeEnv, priceUsd: number) {
  const stripe = createStripeClient(environment);
  const existing = await stripe.prices.list({ lookup_keys: [PRO_PRICE_ID], limit: 1 });
  const current = existing.data[0];
  if (!current) throw new Error("The Pro price is not set up in checkout yet.");
  const productId = typeof current.product === "string" ? current.product : current.product.id;
  if (current.unit_amount === Math.round(priceUsd * 100)) return { changed: false };

  await stripe.prices.create({
    product: productId,
    currency: current.currency || "usd",
    unit_amount: Math.round(priceUsd * 100),
    recurring: { interval: current.recurring?.interval ?? "month" },
    lookup_key: PRO_PRICE_ID,
    transfer_lookup_key: true,
  });
  return { changed: true };
}

export async function savePricing(
  adminId: string,
  environment: StripeEnv,
  input: {
    priceUsd: number;
    comparePriceUsd: number | null;
    saleActive: boolean;
    saleLabel: string;
    saleNote: string | null;
  },
) {
  let checkoutNote: string | null = null;
  try {
    await syncStripePrice(environment, input.priceUsd);
  } catch (error) {
    checkoutNote = getStripeErrorMessage(error);
  }

  const db = await admin();
  const { error } = await db.from("pricing_settings").upsert({
    id: true,
    price_usd: input.priceUsd,
    compare_price_usd: input.comparePriceUsd,
    sale_active: input.saleActive,
    sale_label: input.saleLabel,
    sale_note: input.saleNote,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return { ok: true, checkoutNote };
}

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("promo_codes")
    .select("id, code, label, kind, percent_off, active, max_redemptions, redemptions, expires_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromoCodeRow[];
}

/** Creates a StudyNova code. Percent-off codes also become real checkout discounts. */
export async function createPromoCode(
  adminId: string,
  environment: StripeEnv,
  input: {
    code: string;
    label: string | null;
    kind: "free_pro" | "percent";
    percentOff: number | null;
    maxRedemptions: number | null;
    expiresAt: string | null;
  },
) {
  const code = normalizeCode(input.code);
  if (code.length < 3) throw new Error("Use at least 3 letters or numbers for the code.");

  let stripePromotionCodeId: string | null = null;
  if (input.kind === "percent") {
    const percent = input.percentOff ?? 0;
    if (percent < 1 || percent > 100) throw new Error("Pick a discount between 1% and 100%.");
    try {
      const stripe = createStripeClient(environment);
      const coupon = await stripe.coupons.create({
        percent_off: percent,
        duration: "forever",
        name: input.label || `${percent}% off StudyNova Pro`,
      });
      const promotion = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: coupon.id },
        code,
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiresAt ? { expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
      });
      stripePromotionCodeId = promotion.id;
    } catch (error) {
      throw new Error(`Could not create the discount at checkout: ${getStripeErrorMessage(error)}`);
    }
  }

  const db = await admin();
  const { error } = await db.from("promo_codes").insert({
    code,
    label: input.label,
    kind: input.kind,
    percent_off: input.kind === "percent" ? input.percentOff : null,
    max_redemptions: input.maxRedemptions,
    expires_at: input.expiresAt,
    stripe_promotion_code_id: stripePromotionCodeId,
    created_by: adminId,
  });
  if (error) {
    if (error.code === "23505" || error.message.includes("duplicate")) {
      throw new Error("That code already exists.");
    }
    throw new Error(error.message);
  }
  return { code };
}

export async function setPromoCodeActive(id: string, active: boolean) {
  const db = await admin();
  const { error } = await db.from("promo_codes").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deletePromoCode(id: string) {
  const db = await admin();
  const { error } = await db.from("promo_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Looks up a code a student typed and records the redemption. Server-only. */
export async function consumeFreeProCode(userId: string, raw: string) {
  const code = normalizeCode(raw);
  const db = await admin();
  const { data } = await db
    .from("promo_codes")
    .select("id, kind, active, max_redemptions, redemptions, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!data || !data.active) return null;
  if (data.kind !== "free_pro") return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.max_redemptions !== null && data.redemptions >= data.max_redemptions) return null;

  const { error: claimError } = await db
    .from("promo_redemptions")
    .insert({ promo_code_id: data.id, user_id: userId });
  // A repeat redemption by the same student is fine; it just doesn't count twice.
  if (!claimError) {
    await db
      .from("promo_codes")
      .update({ redemptions: data.redemptions + 1 })
      .eq("id", data.id);
  }
  return { id: data.id };
}
