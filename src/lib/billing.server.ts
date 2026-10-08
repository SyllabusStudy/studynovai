import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FREE_LIMITS, FREE_WINDOW_HOURS, USAGE_LABELS, type BillingState, type UsageKind } from "./plan";
import type Stripe from "stripe";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "./stripe.server";

type DB = SupabaseClient<Database>;

const PRO_STATUSES = new Set(["active", "trialing", "promo"]);

/** Built-in lifetime access codes (owner/creator use). Compared loosely. */
const PROMO_CODES = new Set(["davidlovescallie"]);

const normalizeCode = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Grants unlimited access for a built-in or owner-created code. Server-side only. */
export async function redeemPromoCode(userId: string, code: string) {
  let durationDays: number | null = null;
  if (!PROMO_CODES.has(normalizeCode(code))) {
    const { consumeFreeProCode } = await import("./pricing.server");
    const match = await consumeFreeProCode(userId, code);
    if (!match) throw new Error("That promo code isn't valid.");
    durationDays = match.durationDays;
  }
  if (durationDays) {
    const { data: current } = await supabaseAdmin
      .from("subscriptions").select("plan, status, current_period_end").eq("user_id", userId).maybeSingle();
    // Already on paid/lifetime Pro: nothing to add.
    if (current && rowIsPro(current) && current.status !== "trial") return { plan: "pro" as const, status: current.status };
    const base = current?.status === "trial" && current.current_period_end && new Date(current.current_period_end).getTime() > Date.now()
      ? new Date(current.current_period_end).getTime() : Date.now();
    const end = new Date(base + durationDays * 86_400_000).toISOString();
    const { error } = await supabaseAdmin.from("subscriptions").upsert({ user_id: userId, plan: "pro", status: "trial", current_period_end: end });
    if (error) throw new Error(error.message);
    return { plan: "pro" as const, status: "trial" as const };
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

/** Pro when paid/promo, or during an unexpired 2-day new-account trial. */
function rowIsPro(row: { plan: string; status: string; current_period_end: string | null } | null) {
  if (!row || row.plan !== "pro") return false;
  if (row.status === "trial") {
    return !!row.current_period_end && new Date(row.current_period_end).getTime() > Date.now();
  }
  return PRO_STATUSES.has(row.status);
}

export async function isPro(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  return rowIsPro(data);
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
  const pro = rowIsPro(row ?? null);
  const trialOver = row?.status === "trial" && !pro;
  return {
    plan: pro ? "pro" : "free",
    status: trialOver ? "trial_ended" : (row?.status ?? "inactive"),
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
          classes: -1,
        },
  };
}

/** Finds (or creates) the Stripe customer that carries this user's id. */
async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length && found.data[0]) return found.data[0].id;
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (customer.metadata?.["userId"] !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email ? { email: options.email } : {}),
    metadata: { userId: options.userId },
  });
  return created.id;
}

/** Creates an embedded Stripe Checkout session for the Pro subscription. */
export async function startCheckout(args: {
  environment: StripeEnv;
  userId: string;
  email?: string;
  priceId: string;
  returnUrl: string;
}): Promise<{ clientSecret: string } | { error: string }> {
  try {
    const stripe = createStripeClient(args.environment);
    const prices = await stripe.prices.list({ lookup_keys: [args.priceId] });
    const price = prices.data[0];
    if (!price) throw new Error("Price not found");

    const customerId = await resolveOrCreateCustomer(stripe, {
      userId: args.userId,
      ...(args.email ? { email: args.email } : {}),
    });

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      ui_mode: "embedded_page",
      return_url: args.returnUrl,
      customer: customerId,
      managed_payments: { enabled: true },
      metadata: { userId: args.userId, managed_payments: "true" },
      subscription_data: { metadata: { userId: args.userId } },
    } as Stripe.Checkout.SessionCreateParams);

    return { clientSecret: session.client_secret ?? "" };
  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}

const STRIPE_ACTIVE = new Set(["active", "trialing", "past_due"]);

/** Reads the true state from Stripe after checkout and stores it. */
export async function syncCheckoutSession(
  environment: StripeEnv,
  userId: string,
  sessionId: string,
) {
  const stripe = createStripeClient(environment);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  if (session.metadata?.["userId"] && session.metadata["userId"] !== userId) {
    throw new Error("That checkout belongs to a different account.");
  }
  const sub = session.subscription;
  if (!sub || typeof sub === "string") {
    return { plan: "free" as const, status: session.status ?? "open" };
  }
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? null;
  const active = STRIPE_ACTIVE.has(sub.status);
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: active ? "pro" : "free",
      status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      environment,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { plan: active ? ("pro" as const) : ("free" as const), status: sub.status };
}

export async function cancelPro(supabase: DB, userId: string, environment: StripeEnv) {
  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.stripe_subscription_id) {
    try {
      const stripe = createStripeClient(environment);
      await stripe.subscriptions.cancel(data.stripe_subscription_id);
    } catch {
      // already cancelled on Stripe's side — still drop back to free locally
    }
  }
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      { user_id: userId, plan: "free", status: "canceled", cancel_at_period_end: false },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
  return { ok: true };
}

