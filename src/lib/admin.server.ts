import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export const TOOLS = [
  "scans", "ai_helps", "quizzes", "flashcards", "study_guides", "assignments",
  "syllabus", "tutor", "essays", "humanizer", "video",
] as const;
export type Tool = (typeof TOOLS)[number];

export type Activity = { u: string; tool: Tool; at: string; detail: string };

export type AdminStats = {
  totals: {
    students: number;
    pro: number;
    promo: number;
    snaps: number;
    helps: number;
    classes: number;
    signupsLast7Days: number;
    aiKeys: number;
  };
  students: Array<{
    id: string;
    name: string | null;
    email: string | null;
    school: string | null;
    plan: string;
    status: string;
    joined: string;
    snaps: number;
    helps: number;
    classes: number;
    hasAiKey: boolean;
    aiProvider: string | null;
  }>;
  activity: Activity[];
};

/** True only when the signed-in student's own role row says admin. */
export async function isAdmin(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

const PRO_STATUSES = new Set(["active", "trialing", "promo"]);

const EVENT_TOOL: Record<string, [Tool, string]> = {
  snap: ["scans", "SnapQuick photo scan"],
  assignment_help: ["ai_helps", "AI assignment help"],
  video: ["video", "QuickVideo import"],
  lecture: ["study_guides", "Lecture Notes study guide"],
  study_guide: ["study_guides", "Study coach / study plan"],
  essay: ["essays", "AI Checker scan"],
  humanize: ["humanizer", "Humanize rewrite"],
};

/** Reads every row (the API returns max 1000 per call). */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await q(i, i + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function loadAdminStats(): Promise<AdminStats> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const [profiles, subs, usage, classes, quizzes, cards, assignments, docs, convos, aiKeys] = await Promise.all([
    all((a, b) => db.from("profiles").select("id, name, email, school, created_at").order("created_at", { ascending: false }).range(a, b)),
    all((a, b) => db.from("subscriptions").select("user_id, plan, status").range(a, b)),
    all((a, b) => db.from("usage_events").select("user_id, kind, created_at").range(a, b)),
    all((a, b) => db.from("classes").select("user_id").range(a, b)),
    all((a, b) => db.from("quizzes").select("user_id, title, created_at, completed_at, score").range(a, b)),
    all((a, b) => db.from("flashcards").select("user_id, deck, class_id, created_at").range(a, b)),
    all((a, b) => db.from("assignments").select("user_id, title, created_at").range(a, b)),
    all((a, b) => db.from("documents").select("user_id, file_name, created_at").eq("is_syllabus", true).range(a, b)),
    all((a, b) => db.from("ai_conversations").select("user_id, title, study_mode, created_at").range(a, b)),
    all((a, b) => db.from("user_ai_keys").select("user_id, provider").range(a, b)),
  ]);

  const activity: Activity[] = [];
  for (const e of usage) {
    const t = EVENT_TOOL[e.kind];
    if (t) activity.push({ u: e.user_id, tool: t[0], at: e.created_at, detail: t[1] });
  }
  for (const q of quizzes)
    activity.push({ u: q.user_id, tool: "quizzes", at: q.created_at, detail: `${q.title}${q.completed_at ? ` · taken${q.score != null ? ` (${Math.round(Number(q.score))}%)` : ""}` : " · generated"}` });
  const sets = new Map<string, Activity>();
  for (const c of cards) {
    const name = c.deck || "Untitled deck";
    const key = `${c.user_id}|${name}|${c.class_id ?? ""}`;
    const prev = sets.get(key);
    if (!prev || c.created_at < prev.at) sets.set(key, { u: c.user_id, tool: "flashcards", at: c.created_at, detail: `Flashcard set: ${name}` });
  }
  activity.push(...sets.values());
  for (const a of assignments) activity.push({ u: a.user_id, tool: "assignments", at: a.created_at, detail: a.title });
  for (const d of docs) activity.push({ u: d.user_id, tool: "syllabus", at: d.created_at, detail: d.file_name });
  for (const c of convos) activity.push({ u: c.user_id, tool: "tutor", at: c.created_at, detail: `${c.title} · ${c.study_mode}` });
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const subByUser = new Map(subs.map((s) => [s.user_id, s]));
  const aiKeyByUser = new Map(aiKeys.map((k) => [k.user_id, k.provider]));
  const count = (list: Array<{ u: string }>) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.u, (m.get(r.u) ?? 0) + 1);
    return m;
  };
  const snapMap = count(activity.filter((a) => a.tool === "scans"));
  const helpMap = count(activity.filter((a) => a.tool === "ai_helps"));
  const classMap = count(classes.map((c) => ({ u: c.user_id })));
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const students = profiles.map((p) => {
    const sub = subByUser.get(p.id);
    const pro = sub?.plan === "pro" && PRO_STATUSES.has(sub.status);
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      school: p.school,
      plan: pro ? "pro" : "free",
      status: sub?.status ?? "inactive",
      joined: p.created_at,
      snaps: snapMap.get(p.id) ?? 0,
      helps: helpMap.get(p.id) ?? 0,
      classes: classMap.get(p.id) ?? 0,
      hasAiKey: aiKeyByUser.has(p.id),
      aiProvider: aiKeyByUser.get(p.id) ?? null,
    };
  });

  return {
    totals: {
      students: students.length,
      pro: students.filter((s) => s.plan === "pro").length,
      promo: students.filter((s) => s.status === "promo").length,
      snaps: students.reduce((n, s) => n + s.snaps, 0),
      helps: students.reduce((n, s) => n + s.helps, 0),
      classes: students.reduce((n, s) => n + s.classes, 0),
      signupsLast7Days: students.filter((s) => new Date(s.joined).getTime() >= weekAgo).length,
      aiKeys: students.filter((s) => s.hasAiKey).length,
    },
    students,
    activity,
  };
}

/** Classes belonging to one student, for the owner dashboard. */
export async function loadUserClasses(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, course_code, professor, semester, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Removes every saved AI key for a student (they must re-add their own). */
export async function removeUserAiKeys(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("user_ai_keys").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Removes promo-code Pro from a student (paid Stripe plans are left alone). */
export async function revokePromoPro(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .update({ plan: "free", status: "inactive", current_period_end: null })
    .eq("user_id", userId)
    .eq("status", "promo")
    .select("user_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("This student doesn't have promo-code Pro.");
  return { ok: true };
}

/** Permanently deletes a student account and all of their data. */
export async function deleteUserAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
