import { createFileRoute } from "@tanstack/react-router";
import { collectDueReminders } from "@/lib/reminders";
import { sendPush, type PushDevice } from "@/lib/push.server";

/**
 * Scheduled endpoint: sends background reminders to every device that turned
 * them on. Protected by a shared secret so only the scheduler can call it.
 */
export const Route = createFileRoute("/api/public/push/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PUSH_CRON_SECRET"];
        const given = request.headers.get("x-push-secret");
        if (!secret || given !== secret) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: devices } = await supabaseAdmin
          .from("user_devices")
          .select("id, user_id, push_endpoint, push_p256dh, push_auth")
          .eq("revoked", false)
          .eq("notify_enabled", true)
          .not("push_endpoint", "is", null);

        if (!devices || devices.length === 0) return Response.json({ sent: 0, users: 0 });

        const byUser = new Map<string, PushDevice[]>();
        for (const d of devices) {
          if (!d.push_endpoint || !d.push_p256dh || !d.push_auth) continue;
          const list = byUser.get(d.user_id) ?? [];
          list.push({
            id: d.id,
            push_endpoint: d.push_endpoint,
            push_p256dh: d.push_p256dh,
            push_auth: d.push_auth,
          });
          byUser.set(d.user_id, list);
        }

        let sent = 0;

        for (const [userId, userDevices] of byUser) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("notify_push, default_reminder_minutes")
            .eq("id", userId)
            .maybeSingle();
          if (!profile || profile.notify_push === false) continue;

          const [{ data: assignments }, { data: events }] = await Promise.all([
            supabaseAdmin
              .from("assignments")
              .select("*")
              .eq("user_id", userId)
              .neq("status", "completed")
              .not("due_date", "is", null),
            supabaseAdmin.from("calendar_events").select("*").eq("user_id", userId),
          ]);

          const due = collectDueReminders(
            assignments ?? [],
            events ?? [],
            profile.default_reminder_minutes ?? 1440,
          );

          for (const r of due) {
            const { error } = await supabaseAdmin.from("reminder_deliveries").insert({
              user_id: userId,
              source_kind: r.kind,
              source_id: r.id,
              remind_at: r.remindAt.toISOString(),
              channel: "push",
            });
            // a unique-constraint error means this reminder already went out
            if (error) continue;

            const url = r.kind === "assignment" ? "/assignments" : "/calendar";
            for (const device of userDevices) {
              const result = await sendPush(device, {
                title: r.title,
                body: r.body,
                url,
                tag: `${r.kind}:${r.id}`,
              });
              if (result.ok) sent++;
              if (result.gone) {
                await supabaseAdmin
                  .from("user_devices")
                  .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
                  .eq("id", device.id);
              }
            }
          }
        }

        return Response.json({ sent, users: byUser.size });
      },
    },
  },
});
