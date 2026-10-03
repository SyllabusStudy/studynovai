import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_KEY_HELP, hasUserAiKey, withUserAiKey } from "./ai-key.server";
import { AI_CONNECTION_MESSAGE } from "./ai-request.server";
import {
  runAiTextCheck,
  runHumanize,
  runAssignmentHelp,
  runDocumentExtraction,
  runDocumentMarkup,
  runFlashcardGeneration,
  runQuizGeneration,
  runShortAnswerGrading,
  runSnapHelp,
  runSnapTutor,
  runStudyCoach,
  runStudyPlanEvents,
  runSyllabusAnalysis,
  runTutorChat,
} from "./study.server";

/** Logs a successful tool use for the owner dashboard (never blocks the student). */
function track<T>(ctx: { supabase: { from: (t: "usage_events") => any }; userId: string }, kind: string) {
  return async (r: T) => {
    await Promise.resolve(ctx.supabase.from("usage_events").insert({ user_id: ctx.userId, kind })).catch(() => {});
    return r;
  };
}

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runDocumentExtraction(context.supabase, context.userId, data.documentId),
    ),
  );

export const analyzeSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runSyllabusAnalysis(context.supabase, context.userId, data.documentId),
    ),
  );

export const tutorChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        mode: z.string().default("explain"),
        message: z.string().min(1).max(60000),
        files: z.array(z.object({ name: z.string().max(200), dataUrl: z.string().max(14_000_000) })).max(4).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      const result = await withUserAiKey(context.supabase, context.userId, () =>
        runTutorChat(context.supabase, context.userId, data),
      );
      return { ...result, error: null };
    } catch (error) {
      return {
        conversationId: data.conversationId ?? null,
        reply: null,
        error: error instanceof Error ? error.message : AI_CONNECTION_MESSAGE,
      };
    }
  });

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        classId: z.string().uuid(),
        documentId: z.string().uuid().nullable().optional(),
        count: z.number().int().min(5).max(50),
        difficulty: z.string().default("medium"),
        topic: z.string().max(200).nullable().optional(),
        assignmentId: z.string().uuid().nullable().optional(),
        matchHomework: z.boolean().optional(),
        deck: z.string().max(80).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runFlashcardGeneration(context.supabase, context.userId, data),
    ),
  );

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        classId: z.string().uuid(),
        documentId: z.string().uuid().nullable().optional(),
        documentIds: z.array(z.string().uuid()).max(12).nullable().optional(),

        count: z.number().int().min(5).max(50),
        difficulty: z.string().default("medium"),
        types: z.array(z.string()).min(1),
        title: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runQuizGeneration(context.supabase, context.userId, data),
    ),
  );

export const gradeShortAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(1),
        expected: z.string().min(1),
        studentAnswer: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () => runShortAnswerGrading(data)),
  );

export const studyCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        minutes: z.number().int().min(10).max(480).nullable().optional(),
        question: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { summary: AI_KEY_HELP, tasks: [], needsAiKey: true };
    }
    const result = await withUserAiKey(context.supabase, context.userId, () =>
      runStudyCoach(context.supabase, context.userId, data).then(track(context, "study_guide")),
    );
    return { ...result, needsAiKey: false };
  });

export const createStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runStudyPlanEvents(context.supabase, context.userId, data).then(track(context, "study_guide")),
    ),
  );

export const assignmentHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        question: z.string().max(1000).nullable().optional(),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) }))
          .max(30)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { reply: AI_KEY_HELP };
    }
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "assignment_help");
    const result = await withUserAiKey(context.supabase, context.userId, () =>
      runAssignmentHelp(context.supabase, context.userId, data),
    );
    await recordUsage(context.supabase, context.userId, "assignment_help");
    return result;
  });

export const snapHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        imageDataUrl: z.string().startsWith("data:image/").max(12_000_000),
        classId: z.string().uuid().nullable().optional(),
        question: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { reply: AI_KEY_HELP };
    }
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "snap");
    const result = await withUserAiKey(context.supabase, context.userId, () =>
      runSnapHelp(context.supabase, context.userId, data),
    );
    await recordUsage(context.supabase, context.userId, "snap");
    return result;
  });

export const snapTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        imageDataUrl: z.string().startsWith("data:image/").max(12_000_000).nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        mode: z.enum(["learn", "quick", "tutor", "practice", "check", "method"]).default("learn"),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) }))
          .max(40)
          .default([]),
        message: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { reply: null, error: AI_KEY_HELP };
    }
    try {
      const { assertQuota, recordUsage } = await import("./billing.server");
      if (!data.history.length) await assertQuota(context.supabase, context.userId, "snap");
      const result = await withUserAiKey(context.supabase, context.userId, () =>
        runSnapTutor(context.supabase, context.userId, data),
      );
      if (!data.history.length) await recordUsage(context.supabase, context.userId, "snap");
      return { reply: result.reply, error: null };
    } catch (e) {
      return { reply: null, error: e instanceof Error ? e.message : AI_CONNECTION_MESSAGE };
    }
  });

export const markupDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        documentId: z.string().uuid(),
        pageImages: z.array(z.string().max(6_000_000)).max(3).nullable().optional(),
      })
      .parse(d),
  )

  .handler(async ({ data, context }) =>
    withUserAiKey(context.supabase, context.userId, () =>
      runDocumentMarkup(context.supabase, context.userId, data),
    ),
  );

export const checkAiText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(50).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { result: null, error: AI_KEY_HELP };
    }
    try {
      const result = await withUserAiKey(context.supabase, context.userId, () =>
        runAiTextCheck(data).then(track(context, "essay")),
      );
      return { result, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : AI_CONNECTION_MESSAGE };
    }
  });

export const humanizeAiText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sentences: z.array(z.object({ index: z.number().int().min(0), text: z.string().min(1).max(2000) })).min(1).max(200),
        context: z.string().max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isPro } = await import("./billing.server");
    if (!(await isPro(context.supabase, context.userId))) {
      return { text: null, similarity: null, error: "Humanize is a Pro feature. Upgrade to use it.", needsPro: true };
    }
    if (!(await hasUserAiKey(context.supabase, context.userId))) {
      return { text: null, similarity: null, error: AI_KEY_HELP, needsPro: false };
    }
    try {
      const rewrite = await withUserAiKey(context.supabase, context.userId, () => runHumanize(data).then(track(context, "humanize")));
      if (!rewrite.text) {
        return { text: null, similarity: null, error: "I couldn't produce a meaningful rewrite yet. Please try again.", needsPro: false };
      }
      return { ...rewrite, error: null, needsPro: false };
    } catch (e) {
      return { text: null, similarity: null, error: e instanceof Error ? e.message : AI_CONNECTION_MESSAGE, needsPro: false };
    }
  });
