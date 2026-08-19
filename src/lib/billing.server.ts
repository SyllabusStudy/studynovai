import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FREE_LIMITS, FREE_WINDOW_HOURS, USAGE_LABELS, type BillingState, type UsageKind } from "./plan";
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

const WINDOW_MS = FREE_WINDOW_HOURS * 60 * 60 * 1000;

function windowStartIso() {
  return new Date(Date.now() - WINDOW_MS).toISOString();
}

function formatWait(ms: number) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export async function isPro(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan === "pro" && PRO_STATUSES.has(data.status);
}

/** Uses + when the oldest use in the rolling window ages out. */
async function windowUsage(supabase: DB, userId: string, kind: UsageKind) {
  const { data } = await supabase
    .from("usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStartIso())
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  const oldest = rows[0]?.created_at ?? null;
  return {
    used: rows.length,
    resetAt: oldest ? new Date(new Date(oldest).getTime() + WINDOW_MS).toISOString() : null,
  };
}

/** Throws a friendly error when a free student is out of daily uses. */
export async function assertQuota(supabase: DB, userId: string, kind: UsageKind) {
  if (await isPro(supabase, userId)) return;
  const { used, resetAt } = await windowUsage(supabase, userId, kind);
  const limit = FREE_LIMITS[kind];
  if (used >= limit) {
    const wait = resetAt ? formatWait(new Date(resetAt).getTime() - Date.now()) : `${FREE_WINDOW_HOURS}h`;
    throw new Error(
      `You've hit your free limit of ${limit} ${USAGE_LABELS[kind]} every ${FREE_WINDOW_HOURS} hours. Try again in ${wait}, or upgrade to Pro for unlimited use.`,
    );
  }
}

export async function recordUsage(supabase: DB, userId: string, kind: UsageKind) {
  await supabase.from("usage_events").insert({ user_id: userId, kind });
}

export async function loadBilling(supabase: DB, userId: string): Promise<BillingState> {
  const [sub, help, snap, video, classes] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    windowUsage(supabase, userId, "assignment_help"),
    windowUsage(supabase, userId, "snap"),
    windowUsage(supabase, userId, "video"),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const row = sub.data;
  const pro = row?.plan === "pro" && PRO_STATUSES.has(row.status);
  return {
    plan: pro ? "pro" : "free",
    status: row?.status ?? "inactive",
    currentPeriodEnd: row?.current_period_end ?? null,
    usage: {
      assignment_help: help.used,
      snap: snap.used,
      video: video.used,
      classes: classes.count ?? 0,
    },
    resets: { assignment_help: help.resetAt, snap: snap.resetAt, video: video.resetAt },
    limits: pro
      ? { assignment_help: -1, snap: -1, video: -1, classes: -1 }
      : {
          assignment_help: FREE_LIMITS.assignment_help,
          snap: FREE_LIMITS.snap,
          video: FREE_LIMITS.video,
          classes: FREE_LIMITS.classes,
        },
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

