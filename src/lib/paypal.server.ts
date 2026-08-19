import { PRO_PRICE_USD } from "./plan";

export function paypalEnv(): "live" | "sandbox" {
  return (process.env["PAYPAL_ENV"] ?? "sandbox").trim() === "live" ? "live" : "sandbox";
}

function base() {
  return paypalEnv() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function token(): Promise<string> {
  const id = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("PayPal is not configured yet.");
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? "Could not authenticate with PayPal.");
  }
  return json.access_token;
}

async function api<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const message =
      (json["message"] as string | undefined) ??
      (json["error_description"] as string | undefined) ??
      `PayPal request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

type AdminClient = {
  from: (t: "paypal_config") => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => { maybeSingle: () => Promise<{ data: { plan_id: string | null } | null }> };
    };
    upsert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

/** Creates the $20/month plan on first use and caches its id in the database. */
export async function ensureProPlanId(admin: AdminClient): Promise<string> {
  // Plans are environment-specific: a sandbox plan id is invalid in live and vice versa.
  const configId = paypalEnv() === "live" ? "pro" : "pro-sandbox";
  const existing = await admin
    .from("paypal_config")
    .select("plan_id")
    .eq("id", configId)
    .maybeSingle();
  if (existing.data?.plan_id) return existing.data.plan_id;

  const product = await api<{ id: string }>("/v1/catalogs/products", "POST", {
    name: "StudyMate AI Pro",
    description: "Unlimited AI study help for college students.",
    type: "SERVICE",
    category: "EDUCATIONAL_AND_TEXTBOOKS",
  });

  const plan = await api<{ id: string }>("/v1/billing/plans", "POST", {
    product_id: product.id,
    name: "StudyMate AI Pro Monthly",
    description: `Unlimited classes, assignment help and SnapQuick scans for $${PRO_PRICE_USD}/month.`,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: { value: `${PRO_PRICE_USD}.00`, currency_code: "USD" },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 1,
    },
  });

  const up = await admin
    .from("paypal_config")
    .upsert({ id: "pro", product_id: product.id, plan_id: plan.id });
  if (up.error) throw new Error(up.error.message);
  return plan.id;
}

export type PaypalSubscription = {
  id: string;
  status: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
  links?: { rel: string; href: string }[];
};

export async function createProSubscription(
  planId: string,
  userId: string,
  returnUrl: string,
  cancelUrl: string,
) {
  const sub = await api<PaypalSubscription>("/v1/billing/subscriptions", "POST", {
    plan_id: planId,
    custom_id: userId,
    application_context: {
      brand_name: "StudyMate AI",
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  });
  const approve = sub.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal did not return an approval link.");
  return { id: sub.id, approveUrl: approve };
}

export function getSubscription(subscriptionId: string) {
  return api<PaypalSubscription>(`/v1/billing/subscriptions/${subscriptionId}`, "GET");
}

export async function cancelSubscription(subscriptionId: string) {
  await api(`/v1/billing/subscriptions/${subscriptionId}/cancel`, "POST", {
    reason: "Cancelled by the student in StudyMate AI.",
  });
}
