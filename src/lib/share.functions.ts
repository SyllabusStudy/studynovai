import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

type Card = { front: string; back: string };
type Question = { id?: string; prompt: string; options?: string[]; answer: string; explanation?: string };

export type SharedItem = {
  kind: string;
  title: string;
  payload: { cards?: Card[]; questions?: Question[]; plainText?: string; content?: Json };
  count: number;
};

export const getSharedItem = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<SharedItem | null> => {
    const url = import.meta.env['VITE_SUPABASE_URL'] as string;
    const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await client.rpc("get_shared_item", { _token: data.token });
    if (error) return null;
    const row = (rows as Array<{ kind: string; title: string; payload: SharedItem["payload"] }> | null)?.[0];
    if (!row) return null;
    const payload = row.payload ?? {};
    const count = row.kind === "note" ? (payload.plainText ?? "").trim().split(/\s+/).filter(Boolean).length : row.kind === "deck" ? (payload.cards?.length ?? 0) : (payload.questions?.length ?? 0);
    return { kind: row.kind, title: row.title, payload, count };
  });

