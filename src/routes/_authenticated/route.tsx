import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { OnboardingTour } from "@/components/OnboardingTour";
import { HelpButton } from "@/components/HelpButton";
import { InstallCard } from "@/components/InstallAppButton";
import { checkInDevice } from "@/lib/devices";
import { isGuestToolPath } from "@/lib/guest-gate";
import { useAiKeyStatus } from "@/lib/ai-key-gate";
import { isSchoolEmail } from "@/lib/school-email";
import { supabase } from "@/integrations/supabase/client";
import { takePendingShare } from "@/lib/pending-share";
import { importSharedNote } from "@/lib/notes.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ToolSeoIntro, hasToolSeoIntro } from "@/components/ToolSeoIntro";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const guestAllowed = isGuestToolPath(pathname);
  const { data: keyStatus, isLoading: keyLoading } = useAiKeyStatus();
  // New students get free trial uses first; the app locks once the 10 tool uses are spent.
  const needsKey = !!user && keyStatus?.hasKey === false && (keyStatus.trial?.tools ?? 0) <= 0;

  useEffect(() => {
    if (!loading && !user && !guestAllowed) navigate({ to: "/auth" });
  }, [loading, user, navigate, guestAllowed]);

  useEffect(() => {
    if (user) void import("@/lib/health-monitor").then((m) => m.startHealthMonitor());
  }, [user]);

  // Every signed-in student (email or Google) must add an AI key before entering the app.
  useEffect(() => {
    if (needsKey) navigate({ to: "/setup-ai", replace: true });
  }, [needsKey, navigate]);

  // Google sign-ins with a school account are signed out and sent back.
  useEffect(() => {
    if (user && isSchoolEmail(user.email)) {
      void supabase.auth.signOut().then(() => {
        window.location.href = "/auth?mode=signup&school=1";
      });
    }
  }, [user?.email]);

  // A shared note the visitor chose to keep before signing up: copy it in once AI is set up.
  const importShared = useServerFn(importSharedNote);
  useEffect(() => {
    if (!user || keyStatus?.hasKey !== true) return;
    const pending = takePendingShare();
    if (!pending) return;
    void importShared({ data: { token: pending.token } })
      .then((n) => {
        toast.success("Shared note added to your Notes");
        navigate({ to: "/notes", search: { note: n.id, ai: pending.action === "save" ? undefined : pending.action } });
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't add the shared note."));
  }, [user?.id, keyStatus?.hasKey]);

  useEffect(() => {
    if (user) void checkInDevice(user.id).catch(() => {});
  }, [user?.id]);

  // Guest tool pages render right away (also on the server) so visitors and search engines see content.
  const showGuestPage = guestAllowed && !user;
  if (!showGuestPage && (loading || !user || keyLoading || needsKey)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      {user ? (
        <>
          <OnboardingTour />
          <HelpButton />
          <InstallCard />
        </>
      ) : null}
      <Outlet />
      {!user && hasToolSeoIntro(pathname) ? <ToolSeoIntro pathname={pathname} /> : null}
    </AppShell>
  );
}
