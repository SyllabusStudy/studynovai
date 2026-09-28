import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AssignmentRow, EventRow, ProfileRow } from "@/lib/data";
import { collectDueReminders } from "@/lib/reminder-schedule";

export {
  REMINDER_LEAD_OPTIONS,
  leadLabel,
  dueAt,
  collectDueReminders,
  type PendingReminder,
} from "@/lib/reminder-schedule";

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function show(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const { thisDeviceNotifies } = await import("@/lib/devices");
    if (!(await thisDeviceNotifies())) return;
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg?.showNotification) {
      await reg.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png" });
      return;
    }
    new Notification(title, { body, icon: "/icon-192.png" });
  } catch {
    /* notification delivery is best-effort */
  }
}

/**
 * Fires real device notifications for assignments and calendar events at the
 * lead time each item is configured with. Deliveries are recorded in the
 * database so a reminder never repeats across sessions or devices.
 */
export function useReminderEngine(
  userId: string | undefined,
  assignments: AssignmentRow[],
  events: EventRow[],
  profile: ProfileRow | null | undefined,
) {
  const sentRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!userId || !profile) return;
    if (profile.notify_push === false) return;
    if (notificationPermission() !== "granted") return;

    const due = collectDueReminders(assignments, events, profile.default_reminder_minutes ?? 1440);
    if (due.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const r of due) {
        const key = `${r.kind}:${r.id}:${r.remindAt.toISOString()}`;
        if (sentRef.current.has(key)) continue;
        sentRef.current.add(key);
        const { error } = await supabase.from("reminder_deliveries").insert({
          user_id: userId,
          source_kind: r.kind,
          source_id: r.id,
          remind_at: r.remindAt.toISOString(),
          channel: "push",
        });
        // a unique-constraint error means this reminder already went out
        if (error || cancelled) continue;
        await show(r.title, r.body);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, assignments, events, profile, tick]);
}
