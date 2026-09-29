import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Draft } from "./announce";

async function requireAdmin(supabase: Parameters<typeof import("./admin.server").isAdmin>[0], userId: string) {
  const { isAdmin } = await import("./admin.server");
  if (!(await isAdmin(supabase, userId))) throw new Error("This page is for the site owner only.");
}

const draftInput = (input: { prompt: string; tone: string }) => {
  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length < 5) throw new Error("Tell the AI what the announcement is about.");
  if (prompt.length > 2000) throw new Error("That prompt is too long.");
  return { prompt, tone: input.tone || "helpful" };
};

export const writeAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(draftInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { draftAnnouncement } = await import("./announce.server");
    return draftAnnouncement(data.prompt, data.tone);
  });

export const getAnnouncementAudience = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { listRecipients, listAnnouncementHistory } = await import("./announce.server");
    const [recipients, history] = await Promise.all([listRecipients(), listAnnouncementHistory()]);
    return { count: recipients.length, history };
  });

const sendInput = (input: { draft: Draft; prompt: string; testTo?: string | undefined }) => {
  if (!input.draft?.subject || !input.draft.paragraphs?.length) throw new Error("Write the email first.");
  if (input.testTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.testTo)) throw new Error("That test email address looks wrong.");
  return input;
};

export const sendAnnouncementEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(sendInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { sendAnnouncement } = await import("./announce.server");
    return sendAnnouncement(context.userId, data.draft, data.prompt, data.testTo);
  });

export const unsubscribeFromNews = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.userId ?? "")) throw new Error("That unsubscribe link is not valid.");
    return input;
  })
  .handler(async ({ data }) => {
    const { unsubscribeStudent } = await import("./announce.server");
    return unsubscribeStudent(data.userId);
  });
