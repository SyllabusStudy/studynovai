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

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const guestAllowed = isGuestToolPath(pathname);

  useEffect(() => {
    if (!loading && !user && !guestAllowed) navigate({ to: "/auth" });
  }, [loading, user, navigate, guestAllowed]);

  useEffect(() => {
    if (user) void checkInDevice(user.id).catch(() => {});
  }, [user?.id]);

  if (loading || (!user && !guestAllowed)) {
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
