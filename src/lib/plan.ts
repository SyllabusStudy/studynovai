export const PRO_PRICE_USD = 20;

export const FREE_LIMITS = {
  classes: 3,
  assignment_help: 2,
  snap: 4,
} as const;

export type UsageKind = "assignment_help" | "snap";

export const USAGE_LABELS: Record<UsageKind, string> = {
  assignment_help: "AI assignment help",
  snap: "SnapQuick photo scans",
};

export type BillingState = {
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  usage: { assignment_help: number; snap: number; classes: number };
  limits: { assignment_help: number; snap: number; classes: number };
};
