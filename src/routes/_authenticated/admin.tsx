import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Camera, Crown, KeyRound, Loader2, Sparkles, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { checkAdmin, getAdminStats, getUserClasses, kickUser, removePromoPro, removeUserAiKey } from "@/lib/admin.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminFeedback } from "@/components/AdminFeedback";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Owner dashboard — StudyNova" },
      { name: "description", content: "Sign-ups, Pro upgrades and AI usage across StudyNova." },
      { property: "og:title", content: "Owner dashboard — StudyNova" },
      { property: "og:description", content: "Sign-ups, Pro upgrades and AI usage per student." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const load = useServerFn(getAdminStats);
  const check = useServerFn(checkAdmin);
  const [managing, setManaging] = useState<{ id: string; name: string | null; email: string | null } | null>(null);
  const { data: gate, isLoading: gating } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: () => check({}),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-stats", user?.id],
    enabled: !!gate?.admin,
    queryFn: () => load({}),
  });

  const t = data?.totals;
  const cards = [
    { icon: Users, label: "Students signed up", value: t?.students ?? 0, note: `${t?.signupsLast7Days ?? 0} in the last 7 days` },
    { icon: Crown, label: "Pro upgrades", value: t?.pro ?? 0, note: `${t?.promo ?? 0} via promo code` },
    { icon: Camera, label: "SnapQuick scans", value: t?.snaps ?? 0, note: "all time" },
    { icon: Sparkles, label: "AI assignment helps", value: t?.helps ?? 0, note: "all time" },
  ];

  return (
    <div>
      <PageHeader title="Admin" description="Feedback and usage across every StudyNova account." />

      {gating ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : !gate?.admin ? (
        <p className="text-sm text-muted-foreground">This page is for the site owner only.</p>
      ) : (
      <Tabs defaultValue="feedback">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="feedback"><AdminFeedback /></TabsContent>
        <TabsContent value="analytics">
          <p className="text-sm text-muted-foreground">Visitor analytics are available in your Lovable project analytics. Usage totals are on the Overview tab.</p>
        </TabsContent>
        <TabsContent value="settings">
          <p className="text-sm text-muted-foreground">Owner emails for new feedback turn on once an email sender domain is set up.</p>
        </TabsContent>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load stats."}
        </p>
      ) : (
        <>
          <TabsContent value="overview">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="surface-card min-w-0 p-4">
                <c.icon className="size-4 text-primary" />
                <p className="mt-3 text-2xl font-bold tracking-tight">{c.value}</p>
                <p className="text-xs font-semibold">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.note}</p>
              </div>
            ))}
          </div>

          </TabsContent>
          <TabsContent value="users">

          <div className="space-y-2 lg:hidden">
            {data?.students.map((s) => (
              <div key={s.id} className="surface-card min-w-0 p-4">
                <p className="truncate text-sm font-semibold">{s.name ?? "Student"}</p>
                <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                <p className="mt-2 text-xs">
                  <span className={s.plan === "pro" ? "font-semibold text-primary" : "text-muted-foreground"}>
                    {s.plan === "pro" ? `Pro (${s.status})` : "Free"}
                  </span>
                  {" · joined "}
                  {new Date(s.joined).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.snaps} scans · {s.helps} AI helps · {s.classes} classes
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setManaging(s)}>
                  Manage
                </Button>
              </div>
            ))}
          </div>

          <div className="surface-card hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">Student</th>
                  <th className="p-3 font-semibold">Plan</th>
                  <th className="p-3 font-semibold">Joined</th>
                  <th className="p-3 text-right font-semibold">Scans</th>
                  <th className="p-3 text-right font-semibold">AI helps</th>
                  <th className="p-3 text-right font-semibold">Classes</th>
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.students.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="p-3">
                      <p className="font-semibold">{s.name ?? "Student"}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </td>
                    <td className="p-3">
                      {s.plan === "pro" ? (
                        <span className="font-semibold text-primary">Pro · {s.status}</span>
                      ) : (
                        <span className="text-muted-foreground">Free</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(s.joined).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">{s.snaps}</td>
                    <td className="p-3 text-right">{s.helps}</td>
                    <td className="p-3 text-right">{s.classes}</td>
                    <td className="p-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => setManaging(s)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </TabsContent>
        </>
      )}
      </Tabs>
      )}
      <ManageStudentDialog student={managing} onClose={() => setManaging(null)} />
    </div>
  );
}

function ManageStudentDialog({
  student,
  onClose,
}: {
  student: { id: string; name: string | null; email: string | null; status?: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const loadClasses = useServerFn(getUserClasses);
  const removeKey = useServerFn(removeUserAiKey);
  const kick = useServerFn(kickUser);
  const removePromo = useServerFn(removePromoPro);
  const [busy, setBusy] = useState<"key" | "kick" | "promo" | null>(null);

  const { data: classes, isLoading } = useQuery({
    queryKey: ["admin-user-classes", student?.id],
    enabled: !!student,
    queryFn: () => loadClasses({ data: { userId: student!.id } }),
  });

  async function handleRemovePromo() {
    if (!student) return;
    if (!window.confirm(`Remove promo-code Pro from ${student.email ?? "this student"}?`)) return;
    setBusy("promo");
    try {
      await removePromo({ data: { userId: student.id } });
      toast.success("Pro removed — they're back on Free.");
      await qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove Pro.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveKey() {
    if (!student) return;
    setBusy("key");
    try {
      await removeKey({ data: { userId: student.id } });
      toast.success("AI key removed — they'll need to add a new one.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the key.");
    } finally {
      setBusy(null);
    }
  }

  async function handleKick() {
    if (!student) return;
    if (!window.confirm(`Permanently delete ${student.email ?? "this student"}'s account and all their data? This can't be undone.`)) return;
    setBusy("kick");
    try {
      await kick({ data: { userId: student.id } });
      toast.success("Account removed.");
      await qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the account.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{student?.name ?? "Student"}</DialogTitle>
          <DialogDescription>{student?.email}</DialogDescription>
        </DialogHeader>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Their classes</p>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : classes && classes.length > 0 ? (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {classes.map((c) => (
                <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{c.class_name}</span>
                  {c.course_code ? <span className="text-muted-foreground"> · {c.course_code}</span> : null}
                  {c.semester ? <span className="text-muted-foreground"> · {c.semester}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {student?.status === "promo" ? (
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={handleRemovePromo}>
              {busy === "promo" ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
              Remove Pro (promo code)
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={handleRemoveKey}>
            {busy === "key" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Remove their AI key
          </Button>
          <Button variant="destructive" size="sm" disabled={busy !== null} onClick={handleKick}>
            {busy === "kick" ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
            Kick out (delete account)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
