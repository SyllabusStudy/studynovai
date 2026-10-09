/** Free-plan students can have Glo do this many tasks per rolling 24 hours. Pro is unlimited. */
export const GLO_FREE_DAILY_TASKS = 3;
export const GLO_TASK_KIND = "glo_task";

/** Only real tasks count (notes, quizzes, flashcards, emails) — plain questions stay free. */
export function isGloTask(type: string): boolean {
  return type === "note" || type === "quiz" || type === "flashcards" || type === "email";
}

export function gloTasksLeft(usedToday: number, pro: boolean): number {
  if (pro) return Infinity;
  return Math.max(0, GLO_FREE_DAILY_TASKS - usedToday);
}
