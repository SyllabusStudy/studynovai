import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runVideoChat, runVideoImport } from "./video.server";
import { withUserAiKey } from "./ai-key.server";

export const importVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        url: z.string().url().max(600).nullable().optional(),
        dataUrl: z.string().startsWith("data:video/").max(26_000_000).nullable().optional(),
        fileName: z.string().max(200).nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        title: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "video");
    const result = await withUserAiKey(context.supabase, context.userId, () =>
      runVideoImport(context.supabase, context.userId, data),
    );
    await recordUsage(context.supabase, context.userId, "video");
    return result;
  });

export const videoChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        videoNoteId: z.string().uuid(),
        message: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runVideoChat(context.supabase, context.userId, data),
    ),
  );
