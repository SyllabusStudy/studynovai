export const PRO_PRICE_USD = 20;

export const FREE_LIMITS = {
  classes: 3,
  assignment_help: 2,
  snap: 4,
  video: 2,
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
  limits: { assignment_help: number; snap: number; video: number; classes: number };
};
