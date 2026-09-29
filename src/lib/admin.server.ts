import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export type AdminStats = {
  totals: {
    students: number;
    pro: number;
    promo: number;
    snaps: number;
    helps: number;
    classes: number;
    signupsLast7Days: number;
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
  }>;
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

export async function loadAdminStats(): Promise<AdminStats> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [profiles, subs, usage, classes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, name, email, school, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("subscriptions").select("user_id, plan, status"),
    supabaseAdmin.from("usage_events").select("user_id, kind"),
    supabaseAdmin.from("classes").select("user_id"),
  ]);

  const rows = profiles.data ?? [];
  const subByUser = new Map((subs.data ?? []).map((s) => [s.user_id, s]));

  const count = (list: Array<{ user_id: string }>) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const snapMap = count((usage.data ?? []).filter((u) => u.kind === "snap"));
  const helpMap = count((usage.data ?? []).filter((u) => u.kind === "assignment_help"));
  const classMap = count(classes.data ?? []);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const students = rows.map((p) => {
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
    },
    students,
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

/** Permanently deletes a student account and all of their data. */
export async function deleteUserAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
