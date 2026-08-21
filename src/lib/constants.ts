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
  ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.ppt,.pptx,.txt,.md";

export const ASSIGNMENT_CATEGORIES = [
  { key: "homework", label: "Homework" },
  { key: "essay", label: "Essay / writing" },
  { key: "lab", label: "Lab report" },
  { key: "project", label: "Project" },
  { key: "reading", label: "Reading" },
  { key: "exam_prep", label: "Exam prep" },
  { key: "other", label: "Other" },
] as const;
