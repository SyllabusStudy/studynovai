export const PRO_PRICE_USD = 5.99;

/** Free-plan quotas reset on a rolling window instead of a full calendar day. */
export const FREE_WINDOW_HOURS = 4;

/** Max extra uses a Free student can earn from rewarded ads per rolling 24h. -1 = unlimited. */
export const AD_REWARDS_PER_DAY = -1;

/** Google AdMob iOS rewarded ad unit. */
export const ADMOB_REWARDED_IOS = "ca-app-pub-7682709846932870/8767243813";

export const FREE_LIMITS = {
  /** -1 = unlimited: classes are free for everyone. */
  classes: -1,
  assignment_help: 4,
  snap: 5,
  video: 2,
  lecture: 3,
} as const;

export type UsageKind = "assignment_help" | "snap" | "video" | "lecture";

export const USAGE_LABELS: Record<UsageKind, string> = {
  assignment_help: "AI assignment help",
  snap: "SnapQuick photo scans",
  video: "QuickVideo imports",
  lecture: "Lecture Notes",
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
