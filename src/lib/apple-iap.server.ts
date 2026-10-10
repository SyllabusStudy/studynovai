import * as x509 from "@peculiar/x509";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { APPLE_BUNDLE_ID, APPLE_PRO_PRODUCT_ID } from "./plan";

// SHA-256 fingerprint of Apple Root CA - G3 (signs every StoreKit 2 transaction).
const APPLE_ROOT_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

type AppleTransaction = {
  bundleId: string;
  productId: string;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  originalTransactionId: string;
  environment?: string;
};

/** Verifies a StoreKit 2 signed transaction (JWS) against Apple's root certificate. */
export async function verifyAppleTransaction(jws: string): Promise<AppleTransaction> {
  const [h, p, s] = jws.split(".");
  if (!h || !p || !s) throw new Error("Invalid Apple receipt.");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as { alg: string; x5c?: string[] };
  if (header.alg !== "ES256" || !header.x5c || header.x5c.length < 3) throw new Error("Invalid Apple receipt.");
  const certs = header.x5c.map((c) => new x509.X509Certificate(c));
  const [leaf, inter, root] = certs;
  const fp = hex(await crypto.subtle.digest("SHA-256", root.rawData));
  if (fp !== APPLE_ROOT_G3_SHA256) throw new Error("Receipt not signed by Apple.");
  const now = new Date();
  const okChain =
    (await root.verify({ date: now, signatureOnly: false })) &&
    (await inter.verify({ publicKey: root.publicKey, date: now })) &&
    (await leaf.verify({ publicKey: inter.publicKey, date: now }));
  if (!okChain) throw new Error("Receipt not signed by Apple.");
  const key = await crypto.subtle.importKey("spki", leaf.publicKey.rawData, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw new Error("Receipt signature is invalid.");
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as AppleTransaction;
}

/** Turns a verified Apple subscription into Pro until its expiry date. */
export async function applyAppleTransaction(userId: string, jws: string) {
  const tx = await verifyAppleTransaction(jws);
  if (tx.bundleId !== APPLE_BUNDLE_ID || tx.productId !== APPLE_PRO_PRODUCT_ID) throw new Error("That purchase isn't for SyllabusStudy Pro.");
  if (tx.appAccountToken && tx.appAccountToken.toLowerCase() !== userId.toLowerCase()) {
    throw new Error("This purchase belongs to a different SyllabusStudy account.");
  }
  const expires = tx.expiresDate ?? 0;
  const active = !tx.revocationDate && expires > Date.now();
  const { data: current } = await supabaseAdmin
    .from("subscriptions").select("status, plan").eq("user_id", userId).maybeSingle();
  // Don't overwrite a lifetime promo or an active card subscription.
  if (current?.plan === "pro" && (current.status === "promo" || current.status === "active")) {
    return { plan: "pro" as const, expiresAt: null };
  }
  if (!active) return { plan: "free" as const, expiresAt: expires ? new Date(expires).toISOString() : null };
  const end = new Date(expires).toISOString();
  const { error } = await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId, plan: "pro", status: "apple", current_period_end: end, cancel_at_period_end: false,
  });
  if (error) throw new Error(error.message);
  return { plan: "pro" as const, expiresAt: end };
}
