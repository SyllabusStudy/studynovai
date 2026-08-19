import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
export type EventRow = Database["public"]["Tables"]["calendar_events"]["Row"];
export type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
export type QuizRow = Database["public"]["Tables"]["quizzes"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type GradeCategoryRow = Database["public"]["Tables"]["grade_categories"]["Row"];
export type ConversationRow = Database["public"]["Tables"]["ai_conversations"]["Row"];

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProfileRow | null;
    },
  });
}

export function useClasses(userId?: string) {
  return useQuery({
    queryKey: ["classes", userId],
    enabled: !!userId,
    queryFn: () =>
      must<ClassRow[]>(supabase.from("classes").select("*").order("created_at", { ascending: true })),
  });
}

export function useClass(classId?: string) {
  return useQuery({
    queryKey: ["class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").eq("id", classId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data as ClassRow | null;
    },
  });
}

export function useDocuments(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["documents", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (classId) q = q.eq("class_id", classId);
      return must<DocumentRow[]>(q);
    },
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as DocumentRow[];
      return rows.some((d) => d.processing_status === "processing" || d.processing_status === "pending")
        ? 4000
        : false;
    },
  });
}

export function useAssignmentDocuments(userId?: string, assignmentId?: string) {
  return useQuery({
    queryKey: ["documents", userId, "assignment", assignmentId],
    enabled: !!userId && !!assignmentId,
    queryFn: () =>
      must<DocumentRow[]>(
        supabase
          .from("documents")
          .select("*")
          .eq("assignment_id", assignmentId!)
          .order("created_at", { ascending: false }),
      ),
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as DocumentRow[];
      return rows.some((d) => !d.extracted_text && d.processing_status !== "failed" && d.processing_status !== "unsupported")
        ? 4000
        : false;
    },
  });
}

export function useAssignments(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["assignments", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("assignments").select("*").order("due_date", { ascending: true });
      if (classId) q = q.eq("class_id", classId);
      return must<AssignmentRow[]>(q);
    },
  });
}

export function useEvents(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["events", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("calendar_events").select("*").order("event_date", { ascending: true });
      if (classId) q = q.eq("class_id", classId);
      return must<EventRow[]>(q);
    },
  });
}

export function useFlashcards(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["flashcards", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("flashcards").select("*").order("created_at", { ascending: false });
      if (classId) q = q.eq("class_id", classId);
      return must<FlashcardRow[]>(q);
    },
  });
}

export function useQuizzes(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["quizzes", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("quizzes").select("*").order("created_at", { ascending: false });
      if (classId) q = q.eq("class_id", classId);
      return must<QuizRow[]>(q);
    },
  });
}

export function useGradeCategories(userId?: string, classId?: string) {
  return useQuery({
    queryKey: ["grade_categories", userId, classId ?? "all"],
    enabled: !!userId,
    queryFn: () => {
      let q = supabase.from("grade_categories").select("*").order("created_at", { ascending: true });
      if (classId) q = q.eq("class_id", classId);
      return must<GradeCategoryRow[]>(q);
    },
  });
}

export function useConversations(userId?: string) {
  return useQuery({
    queryKey: ["conversations", userId],
    enabled: !!userId,
    queryFn: () =>
      must<ConversationRow[]>(
        supabase.from("ai_conversations").select("*").order("updated_at", { ascending: false }),
      ),
  });
}

/* ---------------------------------------------------------------- utilities */

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function relativeDay(date: string | null): string {
  const d = daysUntil(date);
  if (d === null) return "No date";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return `in ${d} days`;
}

export function urgencyDot(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days <= 2) return "text-destructive";
  if (days <= 5) return "text-warning";
  return "text-success";
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function classLabel(c?: ClassRow | null): string {
  if (!c) return "General";
  return c.course_code || c.class_name;
}
