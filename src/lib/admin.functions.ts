import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Tells the UI whether to show the owner dashboard link. */
export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("./admin.server");
    return { admin: await isAdmin(context.supabase, context.userId) };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin, loadAdminStats } = await import("./admin.server");
    if (!(await isAdmin(context.supabase, context.userId))) {
      throw new Error("This page is for the site owner only.");
    }
    return loadAdminStats();
  });

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { isAdmin } = await import("./admin.server");
  if (!(await isAdmin(supabase, userId))) {
    throw new Error("This page is for the site owner only.");
  }
}

export const getUserClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { loadUserClasses } = await import("./admin.server");
    return loadUserClasses(data.userId);
  });

export const removeUserAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't remove your own key here.");
    const { removeUserAiKeys } = await import("./admin.server");
    return removeUserAiKeys(data.userId);
  });

export const kickUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't remove your own account.");
    const { deleteUserAccount } = await import("./admin.server");
    return deleteUserAccount(data.userId);
  });
