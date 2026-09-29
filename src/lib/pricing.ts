/** Owner-controlled Pro pricing, readable by anyone (browser-safe). */
import { supabase } from "@/integrations/supabase/client";
import { PRO_PRICE_USD } from "./plan";

export type PricingSettings = {
  priceUsd: number;
  comparePriceUsd: number | null;
  saleActive: boolean;
  saleLabel: string;
  saleNote: string | null;
};

export const DEFAULT_PRICING: PricingSettings = {
  priceUsd: PRO_PRICE_USD,
  comparePriceUsd: null,
  saleActive: false,
  saleLabel: "Limited-time offer",
  saleNote: null,
};

export type PricingRow = {
  price_usd: number | string;
  compare_price_usd: number | string | null;
  sale_active: boolean;
  sale_label: string | null;
  sale_note: string | null;
};

export function mapPricing(row: PricingRow | null | undefined): PricingSettings {
  if (!row) return DEFAULT_PRICING;
  return {
    priceUsd: Number(row.price_usd),
    comparePriceUsd: row.compare_price_usd === null ? null : Number(row.compare_price_usd),
    saleActive: !!row.sale_active,
    saleLabel: row.sale_label?.trim() || DEFAULT_PRICING.saleLabel,
    saleNote: row.sale_note?.trim() || null,
  };
}

/** Whole-dollar amounts drop the trailing .00 so "$5" doesn't read as "$5.00". */
export function money(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Percentage saved versus the comparison price, or null when there's no real saving. */
export function savingsPercent(pricing: PricingSettings) {
  const { priceUsd, comparePriceUsd } = pricing;
  if (!pricing.saleActive || !comparePriceUsd || comparePriceUsd <= priceUsd) return null;
  return Math.round(((comparePriceUsd - priceUsd) / comparePriceUsd) * 100);
}

/** Live pricing straight from the database so price edits show up immediately. */
export async function fetchPricing(): Promise<PricingSettings> {
  const { data } = await supabase
    .from("pricing_settings")
    .select("price_usd, compare_price_usd, sale_active, sale_label, sale_note")
    .maybeSingle();
  return mapPricing(data as PricingRow | null);
}
