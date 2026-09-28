import { useEffect, useState } from "react";

export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse "14:30", "2:30 PM", "2pm" into minutes after midnight. */
export function parseTime(t?: string | null): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Real datetime for a date + optional time. Without a time, the event lasts all day. */
export function eventDateTime(date: string, time?: string | null): Date {
  const d = new Date(`${date}T00:00:00`);
  const mins = parseTime(time);
  if (mins === null) d.setHours(23, 59, 59, 0);
  else d.setMinutes(mins);
  return d;
}

export type TimeStatus = "past" | "today" | "upcoming" | "overdue";

export function classifyEvent(date: string, time: string | null | undefined, now: Date): TimeStatus {
  const at = eventDateTime(date, time);
  if (at.getTime() < now.getTime()) return "past";
  return date === localDateKey(now) ? "today" : "upcoming";
}

export function classifyAssignment(dueDate: string | null, completed: boolean, now: Date): TimeStatus | "none" {
  if (!dueDate) return "none";
  const today = localDateKey(now);
  if (dueDate < today) return completed ? "past" : "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

/** Current time that re-renders every minute (so passed events drop off and midnight rolls over). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    const onVis = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}
