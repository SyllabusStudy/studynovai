/** The public address every shared/copied link should use, whatever domain the
 *  student happens to be browsing on. Older domains stay connected and keep
 *  working, they just aren't what we hand out. */
export const PUBLIC_SITE_URL = "https://syllabusstudy.com";

/** Origin to build shareable links from. Local development keeps its own origin
 *  so links stay clickable while testing. */
export function shareOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_SITE_URL;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  return PUBLIC_SITE_URL;
}

export const CLASS_COLORS = [

  { key: "teal", label: "Teal", token: "var(--class-teal)" },
  { key: "blue", label: "Blue", token: "var(--class-blue)" },
  { key: "indigo", label: "Indigo", token: "var(--class-indigo)" },
  { key: "emerald", label: "Emerald", token: "var(--class-emerald)" },
  { key: "amber", label: "Amber", token: "var(--class-amber)" },
  { key: "orange", label: "Orange", token: "var(--class-orange)" },
  { key: "rose", label: "Rose", token: "var(--class-rose)" },
  { key: "slate", label: "Slate", token: "var(--class-slate)" },
] as const;

export type ClassColor = (typeof CLASS_COLORS)[number]["key"];

export function classColorToken(color: string | null | undefined): string {
  const found = CLASS_COLORS.find((c) => c.key === color);
  return found ? found.token : "var(--class-slate)";
}

export const EVENT_TYPES = [
  "exam",
  "quiz",
  "assignment",
  "project",
  "presentation",
  "final",
  "study_session",
  "class",
  "work",
  "personal",
  "other",
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  exam: "Exam",
  quiz: "Quiz",
  assignment: "Assignment",
  project: "Project",
  presentation: "Presentation",
  final: "Final exam",
  study_session: "Study session",
  class: "Class",
  work: "Work",
  personal: "Personal",
  other: "Event",
};

export const ASSIGNMENT_STATUSES = [
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "late", label: "Late" },
] as const;

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
] as const;

export const STUDY_MODES = [
  { key: "explain", label: "Explain", hint: "Clear, simple explanations" },
  { key: "step_by_step", label: "Step-by-Step", hint: "Full worked solutions" },
  { key: "teach_me", label: "Teach Me", hint: "Learn it from scratch" },
  { key: "quiz_me", label: "Quiz Me", hint: "One question at a time" },
  { key: "check_answer", label: "Check My Answer", hint: "Grade my attempt" },
  { key: "summarize", label: "Summarize", hint: "Condense your materials" },
  { key: "exam_prep", label: "Exam Prep", hint: "Build a study plan" },
] as const;

export type StudyMode = (typeof STUDY_MODES)[number]["key"];

export const REMINDER_OPTIONS = [
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
] as const;

export const DIFFICULTIES = ["easy", "medium", "hard", "exam"] as const;

export const ACCEPTED_UPLOAD_TYPES =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.tsv,.rtf,.odt,.odp,.ods";

export const MATERIAL_CATEGORIES = [
  { key: "syllabus", label: "Syllabi", emoji: "📄" },
  { key: "notes", label: "Notes & study materials", emoji: "📚" },
  { key: "assignment", label: "Assignments", emoji: "📝" },
  { key: "other", label: "Other", emoji: "📎" },
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]["key"];

export const ASSIGNMENT_CATEGORIES = [
  { key: "homework", label: "Homework" },
  { key: "essay", label: "Essay / writing" },
  { key: "lab", label: "Lab report" },
  { key: "project", label: "Project" },
  { key: "reading", label: "Reading" },
  { key: "exam_prep", label: "Exam prep" },
  { key: "other", label: "Other" },
] as const;

export const CALENDAR_FILTERS = [
  { key: "all", label: "All", types: null },
  { key: "classes", label: "Classes", types: ["class"] },
  { key: "assignments", label: "Assignments", types: ["assignment", "project", "presentation"] },
  { key: "exams", label: "Exams", types: ["exam", "quiz", "final"] },
  { key: "study", label: "Study", types: ["study_session"] },
  { key: "work", label: "Work", types: ["work"] },
  { key: "other", label: "Other", types: ["personal", "other"] },
] as const;
