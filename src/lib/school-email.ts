/** School accounts (college or K-12) usually can't create AI keys, so they aren't allowed. */
const SCHOOL_PATTERNS = [
  /\.edu$/,
  /\.edu\.[a-z]{2}$/,
  /\.ac\.[a-z]{2}$/,
  /\.k12\.[a-z]{2}\.us$/,
  /\.k12\./,
  /(^|\.)(school|schools|isd|usd|sd\d*|district|students?|student|stu|college|university|univ|academy)\./,
  /\.sch\.[a-z]{2}$/,
];

export function isSchoolEmail(email: string | null | undefined): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return SCHOOL_PATTERNS.some((r) => r.test(domain));
}

export const SCHOOL_EMAIL_MESSAGE =
  "School emails can't be used — schools block AI keys. Please sign up with a personal email (like Gmail).";
