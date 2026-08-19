import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  runAssignmentHelp,
  runDocumentExtraction,
  runFlashcardGeneration,
  runQuizGeneration,
  runShortAnswerGrading,
  runSnapHelp,
  runStudyCoach,
  runStudyPlanEvents,
  runSyllabusAnalysis,
  runTutorChat,
} from "./study.server";

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    runDocumentExtraction(context.supabase, context.userId, data.documentId),
  );

export const analyzeSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    runSyllabusAnalysis(context.supabase, context.userId, data.documentId),
  );

export const tutorChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        mode: z.string().default("explain"),
        message: z.string().min(1).max(6000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => runTutorChat(context.supabase, context.userId, data));

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
    runFlashcardGeneration(context.supabase, context.userId, data),
  );

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        classId: z.string().uuid(),
        documentId: z.string().uuid().nullable().optional(),
        count: z.number().int().min(5).max(30),
        difficulty: z.string().default("medium"),
        types: z.array(z.string()).min(1),
        title: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => runQuizGeneration(context.supabase, context.userId, data));

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
  .handler(async ({ data }) => runShortAnswerGrading(data));

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
  .handler(async ({ data, context }) => runStudyCoach(context.supabase, context.userId, data));

export const createStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    runStudyPlanEvents(context.supabase, context.userId, data),
  );

export const assignmentHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        question: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "assignment_help");
    const result = await runAssignmentHelp(context.supabase, context.userId, data);
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
    const { assertQuota, recordUsage } = await import("./billing.server");
    await assertQuota(context.supabase, context.userId, "snap");
    const result = await runSnapHelp(context.supabase, context.userId, data);
    await recordUsage(context.supabase, context.userId, "snap");
    return result;
  });
