/**
 * Server-only storage for each student's connector connection key.
 * Keys are encrypted at rest and never leave the server.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function secretKey(): Buffer {
  const raw = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return Buffer.from(raw, "base64");
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  accountEmail?: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row: Record<string, unknown> = {
    user_id: userId,
    connector_id: connectorId,
    connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
    reconnect_required: false,
    updated_at: new Date().toISOString(),
  };
  if (accountEmail !== undefined) row['account_email'] = accountEmail;
  const { error } = await supabaseAdmin
    .from("app_user_connections")
    .upsert(row as never, { onConflict: "user_id,connector_id" });
  if (error) throw error;
}

export async function getConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("connection_key_ciphertext, account_email, reconnect_required")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    connectionAPIKey: decryptConnectionKey(data.connection_key_ciphertext),
    accountEmail: data.account_email,
    reconnectRequired: data.reconnect_required,
  };
}

export async function markReconnectRequired(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_user_connections")
    .update({ reconnect_required: true, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export async function saveAccountEmail(userId: string, connectorId: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_user_connections")
    .update({ account_email: email, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}
