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

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const guestAllowed = isGuestToolPath(pathname);
  const { data: keyStatus, isLoading: keyLoading } = useAiKeyStatus();
  const needsKey = !!user && keyStatus?.hasKey === false;

  useEffect(() => {
    if (!loading && !user && !guestAllowed) navigate({ to: "/auth" });
  }, [loading, user, navigate, guestAllowed]);

  // Every signed-in student (email or Google) must add an AI key before entering the app.
  useEffect(() => {
    if (needsKey) navigate({ to: "/setup-ai", replace: true });
  }, [needsKey, navigate]);

  useEffect(() => {
    if (user) void checkInDevice(user.id).catch(() => {});
  }, [user?.id]);

  if (loading || (!user && !guestAllowed) || (!!user && keyLoading) || needsKey) {
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
    </AppShell>
  );
}
