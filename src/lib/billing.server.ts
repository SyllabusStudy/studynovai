import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FREE_LIMITS, type BillingState, type UsageKind } from "./plan";
import { cancelSubscription, ensureProPlanId, getSubscription, createProSubscription } from "./paypal.server";

type DB = SupabaseClient<Database>;

const PRO_STATUSES = new Set(["active", "trialing", "promo"]);

/** Free lifetime access codes (owner/creator use). Compared loosely. */
const PROMO_CODES = new Set(["davidlovescallie"]);

const normalizeCode = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Grants unlimited access when the code matches. Validated server-side only. */
export async function redeemPromoCode(userId: string, code: string) {
  if (!PROMO_CODES.has(normalizeCode(code))) {
    throw new Error("That promo code isn't valid.");
  }
  const { error } = await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    plan: "pro",
    status: "promo",
    current_period_end: null,
  });
  if (error) throw new Error(error.message);
  return { plan: "pro" as const, status: "promo" as const };
}

function startOfTodayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function isPro(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan === "pro" && PRO_STATUSES.has(data.status);
}

async function countToday(supabase: DB, userId: string, kind: UsageKind) {
  const { count } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", startOfTodayIso());
  return count ?? 0;
}

/** Throws a friendly error when a free student is out of daily uses. */
export async function assertQuota(supabase: DB, userId: string, kind: UsageKind) {
  if (await isPro(supabase, userId)) return;
  const used = await countToday(supabase, userId, kind);
  const limit = FREE_LIMITS[kind];
  if (used >= limit) {
    const what = kind === "snap" ? "SnapQuick scans" : "AI assignment helps";
    throw new Error(
      `Free plan limit reached: ${limit} ${what} per day. Upgrade to Pro for unlimited use.`,
    );
  }
}

export async function recordUsage(supabase: DB, userId: string, kind: UsageKind) {
  await supabase.from("usage_events").insert({ user_id: userId, kind });
}

export async function loadBilling(supabase: DB, userId: string): Promise<BillingState> {
  const [sub, help, snap, classes] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    countToday(supabase, userId, "assignment_help"),
    countToday(supabase, userId, "snap"),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const row = sub.data;
  const pro = row?.plan === "pro" && PRO_STATUSES.has(row.status);
  return {
    plan: pro ? "pro" : "free",
    status: row?.status ?? "inactive",
    currentPeriodEnd: row?.current_period_end ?? null,
    usage: { assignment_help: help, snap, classes: classes.count ?? 0 },
    limits: pro
      ? { assignment_help: -1, snap: -1, classes: -1 }
      : { assignment_help: FREE_LIMITS.assignment_help, snap: FREE_LIMITS.snap, classes: FREE_LIMITS.classes },
  };
}

export async function startCheckout(userId: string, origin: string) {
  const planId = await ensureProPlanId(supabaseAdmin as never);
  return createProSubscription(
    planId,
    userId,
    `${origin}/upgrade?paypal=success`,
    `${origin}/upgrade?paypal=cancel`,
  );
}

const ACTIVE_STATUSES = new Set(["ACTIVE", "APPROVED"]);

/** Reads the true state from PayPal and stores it. Never trusts the client. */
export async function syncSubscription(userId: string, subscriptionId: string) {
  const sub = await getSubscription(subscriptionId);
  if (sub.custom_id && sub.custom_id !== userId) {
    throw new Error("That subscription belongs to a different account.");
  }
  const active = ACTIVE_STATUSES.has(sub.status);
  const { error } = await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    plan: active ? "pro" : "free",
    status: active ? "active" : sub.status.toLowerCase(),
    paypal_subscription_id: sub.id,
    current_period_end: sub.billing_info?.next_billing_time ?? null,
  });
  if (error) throw new Error(error.message);
  return { plan: active ? ("pro" as const) : ("free" as const), status: sub.status };
}

export async function cancelPro(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("paypal_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.paypal_subscription_id) {
    try {
      await cancelSubscription(data.paypal_subscription_id);
    } catch {
      // already cancelled on PayPal's side — still drop back to free locally
    }
  }
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      { user_id: userId, plan: "free", status: "cancelled" },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
  return { ok: true };
}

