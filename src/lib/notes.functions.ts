import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { titleFromNotes } from "@/lib/personal-notes";

const noteId = z.object({ id: z.string().uuid() });

export const listPersonalNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("personal_notes")
      .select("id,title,plain_text,updated_at,class_id,title_is_auto").eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Your notes couldn't be loaded. Please try again.");
    return data;
  });

export const getPersonalNote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(noteId)
  .handler(async ({ context, data: input }) => {
    const { data, error } = await context.supabase.from("personal_notes").select("*")
      .eq("user_id", context.userId).eq("id", input.id).maybeSingle();
    if (error) throw new Error("This note couldn't be loaded. Please try again.");
    return data;
  });

export const createPersonalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ classId: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ context, data: input }) => {
    let classId: string | null = null;
    if (input?.classId) {
      const { data: owned } = await context.supabase.from("classes").select("id").eq("id", input.classId).eq("user_id", context.userId).maybeSingle();
      if (owned) classId = owned.id;
    }
    const { data, error } = await context.supabase.from("personal_notes")
      .insert({ user_id: context.userId, title_is_auto: true, class_id: classId }).select("id").single();
    if (error) throw new Error("Your note couldn't be created. Please try again.");
    return data;
  });

export const savePersonalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(), title: z.string().max(200),
    contentJson: z.string().max(8_000_000), plainText: z.string().max(1_000_000),
    revision: z.number().int().nonnegative(),
    classId: z.string().uuid().nullable(), titleIsAuto: z.boolean(),
    drawingJson: z.string().max(12_000_000).optional(), editorMode: z.enum(["type", "draw"]).optional(),
    force: z.boolean().optional(),
  }))
  .handler(async ({ context, data: input }) => {
    let content: Json;
    try {
      content = JSON.parse(input.contentJson) as Json;
      if (!content || typeof content !== "object" || Array.isArray(content) || content['type'] !== "doc") {
        throw new Error("Invalid document");
      }
    } catch { throw new Error("This document couldn't be saved. Please try again."); }
    let drawing: Json | undefined;
    if (input.drawingJson !== undefined) {
      try {
        drawing = JSON.parse(input.drawingJson) as Json;
        if (!drawing || typeof drawing !== "object" || Array.isArray(drawing) || !Array.isArray(drawing['pages'])) throw new Error("bad");
      } catch { throw new Error("Your drawing couldn't be saved. Please try again."); }
    }
    if (input.classId) {
      const { data: ownedClass, error: classError } = await context.supabase.from("classes").select("id").eq("id", input.classId).eq("user_id", context.userId).maybeSingle();
      if (classError || !ownedClass) throw new Error("Choose one of your own classes before saving.");
    }
    let base = input.revision;
    if (input.force) {
      // No other editor has this note open, so a revision mismatch is our own earlier save (e.g. a dropped response).
      const { data: cur } = await context.supabase.from("personal_notes").select("revision").eq("user_id", context.userId).eq("id", input.id).maybeSingle();
      if (cur) base = cur.revision;
    }
    const { data, error } = await context.supabase.from("personal_notes")
      .update({ title: input.titleIsAuto ? titleFromNotes(input.plainText) : input.title.trim() || "Untitled note", class_id: input.classId, title_is_auto: input.titleIsAuto, content, plain_text: input.plainText, revision: base + 1, ...(drawing !== undefined ? { drawing } : {}), ...(input.editorMode ? { editor_mode: input.editorMode } : {}) })
      .eq("user_id", context.userId).eq("id", input.id).eq("revision", base)
      .select("revision,updated_at").maybeSingle();
    if (error) throw new Error("Your changes couldn't be saved. Keep this note open and try again.");
    if (!data) throw new Error("This note changed in another window. Copy your changes before reopening it.");
    return data;
  });

export const renamePersonalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) }))
  .handler(async ({ context, data }) => {
    // Increment the revision as well, so an open editor cannot silently overwrite a rename.
    const { data: current, error: readError } = await context.supabase.from("personal_notes")
      .select("revision").eq("user_id", context.userId).eq("id", data.id).maybeSingle();
    if (readError || !current) throw new Error("This note is unavailable.");
    const { data: changed, error } = await context.supabase.from("personal_notes")
      .update({ title: data.title, title_is_auto: false, revision: current.revision + 1 })
      .eq("user_id", context.userId).eq("id", data.id).eq("revision", current.revision).select("id").maybeSingle();
    if (error || !changed) throw new Error("Your note couldn't be renamed. Please try again.");
    return { ok: true };
  });

export const deletePersonalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(noteId)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("personal_notes").delete()
      .eq("user_id", context.userId).eq("id", data.id);
    if (error) throw new Error("Your note couldn't be deleted. Please try again.");
    return { ok: true };
  });
export const importSharedNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ token: z.string().min(1).max(200) }))
  .handler(async ({ context, data: input }) => {
    const { data: rows, error } = await context.supabase.rpc("get_shared_item", { _token: input.token });
    const row = (rows as Array<{ kind: string; title: string; payload: Json }> | null)?.[0];
    if (error || !row || row.kind !== "note") throw new Error("This shared note isn't available anymore.");
    const p = (row.payload ?? {}) as { content?: Json; plainText?: string };
    const content = p.content && typeof p.content === "object" && !Array.isArray(p.content) && (p.content as { type?: string }).type === "doc"
      ? p.content : ({ type: "doc", content: [] } as Json);
    const { data, error: insertError } = await context.supabase.from("personal_notes")
      .insert({ user_id: context.userId, title: row.title.slice(0, 200) || "Shared note", title_is_auto: false, content, plain_text: (p.plainText ?? "").slice(0, 1_000_000) })
      .select("id").single();
    if (insertError) throw new Error("The shared note couldn't be added to your notes.");
    return data;
  });
