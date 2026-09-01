import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { AiKeyCard } from "@/components/AiKeyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REMINDER_OPTIONS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — StudyMate AI" },
      { name: "description", content: "Update your student profile, reminder timing and appearance." },
      { property: "og:title", content: "Settings — StudyMate AI" },
      { property: "og:description", content: "Profile, reminders and appearance settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfile(user?.id);
  const { theme, toggle } = useTheme();
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [form, setForm] = useState({
    name: "",
    school: "",
    major: "",
    graduation_year: "",
    default_reminder_minutes: 1440,
    notify_email: true,
    notify_push: true,
  });

  useEffect(() => {
    setPerm(notificationPermission());
  }, []);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? "",
      school: profile.school ?? "",
      major: profile.major ?? "",
      graduation_year: profile.graduation_year ?? "",
      default_reminder_minutes: profile.default_reminder_minutes ?? 1440,
      notify_email: profile.notify_email,
      notify_push: profile.notify_push,
    });
  }, [profile]);

  async function enablePush() {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") toast.success("Reminders on — we'll notify you before each deadline.");
    else if (result === "denied")
      toast.error("Notifications are blocked. Allow them for this site in your browser settings.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: form.name || null,
        school: form.school || null,
        major: form.major || null,
        graduation_year: form.graduation_year || null,
        default_reminder_minutes: form.default_reminder_minutes,
        default_reminder_days: Math.max(1, Math.round(form.default_reminder_minutes / 1440)),
        notify_email: form.notify_email,
        notify_push: form.notify_push,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Settings saved");
  }


  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your profile, plan, reminders and appearance." />

      <Hint id="settings-profile" point="down" className="mb-4">
        Fill in your school and major — the AI uses this to tailor explanations and reminders to you.
      </Hint>

      <div className="surface-card mb-4 flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold">Plan & billing</p>
          <p className="text-xs text-muted-foreground">
            See your usage or go unlimited for $5.99/month.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/upgrade">View plans</Link>
        </Button>
      </div>


      <AiKeyCard />

      <form onSubmit={save} className="surface-card space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="school">School</Label>
            <Input
              id="school"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="major">Major</Label>
            <Input
              id="major"
              value={form.major}
              onChange={(e) => setForm({ ...form, major: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="grad">Graduation year</Label>
            <Input
              id="grad"
              value={form.graduation_year}
              onChange={(e) => setForm({ ...form, graduation_year: e.target.value })}
              placeholder="2029"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default reminder</Label>
            <Select
              value={String(form.default_reminder_days)}
              onValueChange={(v) => setForm({ ...form, default_reminder_days: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-semibold">Email reminders</p>
            <p className="text-xs text-muted-foreground">Get a nudge before deadlines.</p>
          </div>
          <Switch
            checked={form.notify_email}
            onCheckedChange={(v) => setForm({ ...form, notify_email: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-semibold">Dark mode</p>
            <p className="text-xs text-muted-foreground">Currently {theme}.</p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={() => toggle()} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Save settings
        </Button>
      </form>
    </div>
  );
}
