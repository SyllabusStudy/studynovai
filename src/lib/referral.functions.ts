import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export function cleanRef(raw: string | null | undefined) {
  const v = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return v || null;
}

/** Tags a brand-new account (under 7 days old, not yet tagged) with its creator code. */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ref: string }) => input)
  .handler(async ({ data, context }) => {
    const ref = cleanRef(data.ref);
    if (!ref) return { ok: false };
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    await context.supabase
      .from("profiles")
      .update({ referred_by: ref })
      .eq("id", context.userId)
      .is("referred_by", null)
      .gte("created_at", since);
    return { ok: true };
  });

export const getCreatorStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("./admin.server");
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("This page is for the site owner only.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await db.from("profiles").select("id, email, created_at, referred_by").not("referred_by", "is", null).limit(5000);
    const ids = (profs ?? []).map((p) => p.id);
    const { data: subs } = ids.length
      ? await db.from("subscriptions").select("user_id, plan, status").in("user_id", ids)
      : { data: [] as { user_id: string; plan: string; status: string }[] };
    const paid = new Set((subs ?? []).filter((s) => s.plan === "pro" && ["active", "trialing", "apple"].includes(s.status)).map((s) => s.user_id));
    const map = new Map<string, { code: string; signups: number; pro: number; students: { email: string | null; joined: string; pro: boolean }[] }>();
    for (const p of profs ?? []) {
      const code = p.referred_by!;
      const row = map.get(code) ?? { code, signups: 0, pro: 0, students: [] };
      row.signups++;
      const isPro = paid.has(p.id);
      if (isPro) row.pro++;
      row.students.push({ email: p.email, joined: p.created_at, pro: isPro });
      map.set(code, row);
    }
    return [...map.values()].sort((a, b) => b.signups - a.signups);
  });
