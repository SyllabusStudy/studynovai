import { APPLE_PRO_PRODUCT_ID } from "./plan";

type Tx = { productIdentifier?: string; jwsRepresentation?: string; receipt?: string; isActive?: boolean };
type NativePurchasesPlugin = {
  purchaseProduct: (o: Record<string, unknown>) => Promise<Tx>;
  restorePurchases: () => Promise<unknown>;
  getPurchases: (o?: Record<string, unknown>) => Promise<{ purchases: Tx[] }>;
  getProduct: (o: Record<string, unknown>) => Promise<{ product: { priceString?: string } }>;
};

function plugin(): NativePurchasesPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "ios") return null;
  return (cap.Plugins?.NativePurchases as NativePurchasesPlugin) ?? null;
}

/** True only inside the iPhone app build that includes Apple in-app purchases. */
export function applePurchasesAvailable() {
  return !!plugin();
}

export async function applePriceString() {
  const p = plugin();
  if (!p) return null;
  const r = await p.getProduct({ productIdentifier: APPLE_PRO_PRODUCT_ID, productType: "subs" }).catch(() => null);
  return r?.product?.priceString ?? null;
}

/** Opens Apple's Face ID purchase sheet. Returns the signed transaction to verify server-side. */
export async function buyProWithApple(userId: string): Promise<string | null> {
  const p = plugin();
  if (!p) return null;
  const tx = await p.purchaseProduct({
    productIdentifier: APPLE_PRO_PRODUCT_ID,
    productType: "subs",
    quantity: 1,
    appAccountToken: userId,
  });
  return tx?.jwsRepresentation ?? (await latestAppleJws());
}

/** Finds the newest Pro transaction on this Apple ID (used for Restore + renewals). */
export async function latestAppleJws(restore = false): Promise<string | null> {
  const p = plugin();
  if (!p) return null;
  if (restore) await p.restorePurchases().catch(() => undefined);
  const r = await p.getPurchases({ productType: "subs" }).catch(() => ({ purchases: [] as Tx[] }));
  const match = r.purchases.find((t) => t.productIdentifier === APPLE_PRO_PRODUCT_ID && t.jwsRepresentation);
  return match?.jwsRepresentation ?? null;
}
