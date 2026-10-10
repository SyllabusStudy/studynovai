import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const claimAdReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["assignment_help", "snap", "video", "lecture"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { grantAdReward } = await import("./billing.server");
    return grantAdReward(context.userId, data.kind);
  });
