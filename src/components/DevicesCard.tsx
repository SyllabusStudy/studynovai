import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentDeviceId } from "@/lib/devices";
import { disableBackgroundPush, enableBackgroundPush, pushSupported } from "@/lib/push";

const ICONS = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor } as const;

export function DevicesCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const thisId = typeof window === "undefined" ? "" : currentDeviceId();
  const { data: devices = [] } = useQuery({
    queryKey: ["devices", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_devices")
        .select("*")
        .eq("revoked", false)
        .order("last_seen", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["devices", userId] });

  const [busy, setBusy] = useState(false);
  const thisPush = Boolean(devices.find((d) => d.id === thisId)?.push_endpoint);

  async function togglePush() {
    setBusy(true);
    try {
      if (thisPush) {
        await disableBackgroundPush();
        toast.success("Background reminders off on this device");
      } else {
        const res = await enableBackgroundPush();
        if (!res.ok) {
          toast.error(
            res.reason === "denied"
              ? "Your browser blocked notifications. Allow them in the site settings and try again."
              : "Background reminders aren't available in this browser yet.",
          );
        } else {
          toast.success("Background reminders on. You'll get them even when SyllabusNova is closed.");
        }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, v: boolean) {
    const { error } = await supabase.from("user_devices").update({ notify_enabled: v }).eq("id", id);
    if (error) return void toast.error(error.message);
    await refresh();
  }

  async function signOutEverywhere(localOnly: boolean) {
    await qc.cancelQueries();
    if (!localOnly) await supabase.from("user_devices").delete().eq("user_id", userId);
    else await supabase.from("user_devices").delete().eq("id", thisId);
    qc.clear();
    await supabase.auth.signOut({ scope: localOnly ? "local" : "global" });
    navigate({ to: "/auth", replace: true });
  }

  async function logOut(id: string) {
    if (id === thisId) return signOutEverywhere(true);
    const { error } = await supabase.from("user_devices").update({ revoked: true }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("That device will be logged out next time it opens SyllabusNova");
    await refresh();
  }

  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-bold">Devices &amp; notifications</h2>
        <p className="text-xs text-muted-foreground">
          You stay signed in on every device until you log out. Everything syncs to your account.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-sm font-semibold">Reminders when SyllabusNova is closed</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {thisPush
            ? "This device gets reminders on its lock screen, even when SyllabusNova is closed."
            : "Turn this on to get assignment and exam reminders even when SyllabusNova is closed."}
        </p>
        <Button
          size="sm"
          className="mt-3"
          variant={thisPush ? "outline" : "default"}
          disabled={busy || !pushSupported()}
          onClick={() => void togglePush()}
        >
          {thisPush ? "Turn off on this device" : "Turn on for this device"}
        </Button>
        {!pushSupported() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This browser can&apos;t do it. On iPhone, add SyllabusNova to your home screen first.
          </p>
        ) : null}
      </div>
      <ul className="space-y-2">
        {devices.map((d) => {
          const Icon = ICONS[d.kind as keyof typeof ICONS] ?? Monitor;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
              <Icon className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {d.label} {d.id === thisId ? <span className="text-xs text-primary">(this device)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active {new Date(d.last_seen).toLocaleDateString()} · Notifications{" "}
                  {d.notify_enabled ? "on" : "off"}
                </p>
              </div>
              <Switch
                aria-label="Notifications on this device"
                checked={d.notify_enabled}
                onCheckedChange={(v) => void toggle(d.id, v)}
              />
              <Button size="sm" variant="ghost" onClick={() => void logOut(d.id)}>
                Log out
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="outline" size="sm" onClick={() => void signOutEverywhere(false)}>
        Log out of all devices
      </Button>
    </section>
  );
}
