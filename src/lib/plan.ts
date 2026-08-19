export const PRO_PRICE_USD = 5.99;

/** Free-plan quotas reset on a rolling window instead of a full calendar day. */
export const FREE_WINDOW_HOURS = 5;

export const FREE_LIMITS = {
  classes: 3,
  assignment_help: 2,
  snap: 4,
  video: 1,
} as const;

export type UsageKind = "assignment_help" | "snap" | "video";

export const USAGE_LABELS: Record<UsageKind, string> = {
  assignment_help: "AI assignment help",
  snap: "SnapQuick photo scans",
  video: "QuickVideo imports",
};

export type BillingState = {
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  usage: { assignment_help: number; snap: number; video: number; classes: number };
  /** ISO time when each free quota frees up again, or null when nothing is used. */
  resets: { assignment_help: string | null; snap: string | null; video: string | null };
  limits: { assignment_help: number; snap: number; video: number; classes: number };
};
