import type { Database } from "@/integrations/supabase/types";

export type PersonalNote = Database["public"]["Tables"]["personal_notes"]["Row"] & {
  class_id: string | null;
  title_is_auto: boolean;
};
export type PersonalNoteSummary = Pick<PersonalNote, "id" | "title" | "plain_text" | "updated_at" | "class_id" | "title_is_auto">;

export function noteWordCount(text: string, selectedText: string | null = null): number {
  return (selectedText ?? text).trim().split(/\s+/).filter(Boolean).length;
}

export function titleFromNotes(text: string): string {
  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  if (!firstLine) return "Untitled note";
  const words = firstLine.replace(/^[#•\-*\d.)\s]+/, "").replace(/\s+/g, " ").split(" ");
  const title = words.slice(0, 10).join(" ");
  return title.length > 80 ? `${title.slice(0, 77).trimEnd()}…` : title || "Untitled note";
}