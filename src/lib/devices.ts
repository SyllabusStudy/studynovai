import { supabase } from "@/integrations/supabase/client";

const KEY = "studynova-device-id";

export function currentDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function describeDevice(): { label: string; kind: "phone" | "tablet" | "laptop" | "desktop" } {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  if (/iPad|Tablet/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return { label: `iPad / tablet · ${browser}`, kind: "tablet" };
  if (/iPhone/.test(ua)) return { label: `iPhone · ${browser}`, kind: "phone" };
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? { label: `Android phone · ${browser}`, kind: "phone" } : { label: `Android tablet · ${browser}`, kind: "tablet" };
  if (/Macintosh/.test(ua)) return { label: `Mac · ${browser}`, kind: "laptop" };
  if (/Windows/.test(ua)) return { label: `Windows PC · ${browser}`, kind: "desktop" };
  if (/CrOS/.test(ua)) return { label: `Chromebook · ${browser}`, kind: "laptop" };
  return { label: `Computer · ${browser}`, kind: "desktop" };
}

/** Registers this device and signs it out if it was logged out from another device. */
export async function checkInDevice(userId: string): Promise<void> {
  const id = currentDeviceId();
  const { data } = await supabase.from("user_devices").select("revoked").eq("id", id).maybeSingle();
  if (data?.revoked) {
    await supabase.from("user_devices").delete().eq("id", id);
    await supabase.auth.signOut({ scope: "local" });
    return;
  }
  const d = describeDevice();
  await supabase
    .from("user_devices")
    .upsert({ id, user_id: userId, label: d.label, kind: d.kind, last_seen: new Date().toISOString() });
}

export async function thisDeviceNotifies(): Promise<boolean> {
  const { data } = await supabase.from("user_devices").select("notify_enabled").eq("id", currentDeviceId()).maybeSingle();
  return data?.notify_enabled ?? true;
}
