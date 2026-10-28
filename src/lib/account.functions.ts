import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lets a signed-in student permanently delete their own account and data (Apple guideline 5.1.1(v)). */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteUserAccount } = await import("./admin.server");
    return deleteUserAccount(context.userId);
  });
