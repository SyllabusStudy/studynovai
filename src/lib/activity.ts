import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDateKey } from "@/lib/dates";

export type StudyActivity =
  | "assignment_done"
  | "flashcards"
  | "quiz"
  | "tutor"
  | "snapquick"
  | "quickvideo"
  | "study_session";

/** Log a meaningful study action for today. Same day + type is stored once. */
export async function recordStudyActivity(type: StudyActivity, qc?: QueryClient) {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  const day = localDateKey(new Date());
  await supabase
    .from("study_activity")
    .upsert({ user_id: uid, day, activity_type: type }, { onConflict: "user_id,day,activity_type", ignoreDuplicates: true });
  const streak = await computeStreak(uid);
  await supabase.from("profiles").update({ study_streak: streak, last_study_date: day }).eq("id", uid);
  qc?.invalidateQueries({ queryKey: ["streak"] });
}

async function computeStreak(uid: string): Promise<number> {
  const { data } = await supabase
    .from("study_activity")
    .select("day")
    .eq("user_id", uid)
    .order("day", { ascending: false })
    .limit(400);
  const days = new Set((data ?? []).map((r) => r.day as string));
  const cursor = new Date();
  // A streak is still alive if you studied yesterday but not yet today.
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (days.has(localDateKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function useStreak(userId?: string) {
  return useQuery({
    queryKey: ["streak", userId],
    enabled: !!userId,
    queryFn: async () => {
      const n = await computeStreak(userId!);
      const { data } = await supabase
        .from("study_activity")
        .select("id")
        .eq("user_id", userId!)
        .eq("day", localDateKey(new Date()))
        .limit(1);
      return { streak: n, studiedToday: (data ?? []).length > 0 };
    },
  });
}

export function useRecordActivity() {
  const qc = useQueryClient();
  return (type: StudyActivity) => void recordStudyActivity(type, qc).catch(() => {});
}
