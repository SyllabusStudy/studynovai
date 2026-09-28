import { supabase } from "@/integrations/supabase/client";
import { currentDeviceId } from "@/lib/devices";

/** Public VAPID key — safe to ship to the browser. */
export const VAPID_PUBLIC_KEY =
  "BPwUHp4HDRMFL6KWYfo10aHkRH-wacf1ZqLUNq5t_ACrxyuitkffw-fiylaXV5hFRqXTNqdKoBQ0sRQyOVAgB4Y";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let s = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Asks for permission, subscribes this device and saves it to the account. */
export async function enableBackgroundPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await registration();
  if (!reg) return { ok: false, reason: "no-worker" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const p256dh = toBase64Url(sub.getKey("p256dh"));
  const auth = toBase64Url(sub.getKey("auth"));
  if (!p256dh || !auth) return { ok: false, reason: "no-keys" };

  const { error } = await supabase
    .from("user_devices")
    .update({
      push_endpoint: sub.endpoint,
      push_p256dh: p256dh,
      push_auth: auth,
      push_subscribed_at: new Date().toISOString(),
      notify_enabled: true,
    })
    .eq("id", currentDeviceId());
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Removes background notifications for this device. */
export async function disableBackgroundPush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await sub.unsubscribe().catch(() => false);
  await supabase
    .from("user_devices")
    .update({ push_endpoint: null, push_p256dh: null, push_auth: null, push_subscribed_at: null })
    .eq("id", currentDeviceId());
}
