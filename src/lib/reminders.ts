import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AssignmentRow, EventRow, ProfileRow } from "@/lib/data";

export const REMINDER_LEAD_OPTIONS = [
  { minutes: 0, label: "At the due time" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 4320, label: "3 days before" },
  { minutes: 10080, label: "1 week before" },
] as const;

export function leadLabel(minutes: number | null | undefined): string {
  const found = REMINDER_LEAD_OPTIONS.find((o) => o.minutes === (minutes ?? -1));
  return found ? found.label : "Default reminder";
}

/** Default clock time used when an item has a date but no time. */
const DEFAULT_HOUR = 9;

export function dueAt(date: string | null | undefined, time?: string | null): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  let hh = DEFAULT_HOUR;
  let mm = 0;
  const match = time?.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    hh = Number(match[1]);
    mm = Number(match[2]);
    if (/pm/i.test(time ?? "") && hh < 12) hh += 12;
    if (/am/i.test(time ?? "") && hh === 12) hh = 0;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export type PendingReminder = {
  kind: "assignment" | "event";
  id: string;
  title: string;
  body: string;
  remindAt: Date;
  dueAt: Date;
};

export function collectDueReminders(
  assignments: AssignmentRow[],
  events: EventRow[],
  defaultMinutes: number,
  now = new Date(),
): PendingReminder[] {
  const out: PendingReminder[] = [];
  const push = (r: PendingReminder) => {
    // fire from the reminder moment until the item is due (plus a short grace window)
    if (now >= r.remindAt && now.getTime() <= r.dueAt.getTime() + 6 * 60 * 60 * 1000) out.push(r);
  };

  for (const a of assignments) {
    if (a.status === "completed" || !a.due_date) continue;
    const due = dueAt(a.due_date);
    if (!due) continue;
    const lead = a.reminder_minutes ?? defaultMinutes;
    push({
      kind: "assignment",
      id: a.id,
      title: `Due soon: ${a.title}`,
      body: `Assignment due ${due.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      remindAt: new Date(due.getTime() - lead * 60000),
      dueAt: due,
    });
  }

  for (const e of events) {
    const due = dueAt(e.event_date, e.event_time);
    if (!due) continue;
    const lead = e.reminder_minutes ?? defaultMinutes;
    push({
      kind: "event",
      id: e.id,
      title: `Coming up: ${e.title}`,
      body: due.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
      remindAt: new Date(due.getTime() - lead * 60000),
      dueAt: due,
    });
  }

  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

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
