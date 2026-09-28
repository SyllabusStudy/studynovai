import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

export type PushDevice = {
  id: string;
  push_endpoint: string;
  push_p256dh: string;
  push_auth: string;
};

export type PushNote = { title: string; body: string; url?: string; tag?: string };

/** Sends one notification to one device. Returns true when the push service accepted it. */
export async function sendPush(device: PushDevice, note: PushNote): Promise<{ ok: boolean; gone: boolean }> {
  const vapid = {
    subject: process.env["VAPID_SUBJECT"] || "mailto:support@studynova.app",
    publicKey: process.env["VAPID_PUBLIC_KEY"]!,
    privateKey: process.env["VAPID_PRIVATE_KEY"]!,
  };
  const subscription: PushSubscription = {
    endpoint: device.push_endpoint,
    expirationTime: null,
    keys: { p256dh: device.push_p256dh, auth: device.push_auth },
  };
  try {
    const payload = await buildPushPayload(
      { data: JSON.stringify(note), options: { ttl: 60 * 60 * 6 } },
      subscription,
      vapid,
    );
    const res = await fetch(subscription.endpoint, payload);
    // 404/410 mean the browser threw the subscription away
    return { ok: res.ok, gone: res.status === 404 || res.status === 410 };
  } catch {
    return { ok: false, gone: false };
  }
}
