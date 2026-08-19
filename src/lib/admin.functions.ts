import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
