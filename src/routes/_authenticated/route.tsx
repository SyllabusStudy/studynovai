import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { OnboardingTour } from "@/components/OnboardingTour";
import { HelpButton } from "@/components/HelpButton";
import { InstallCard } from "@/components/InstallAppButton";
import { checkInDevice } from "@/lib/devices";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) void checkInDevice(user.id).catch(() => {});
  }, [user?.id]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <OnboardingTour />
      <HelpButton />
      <InstallCard />
      <Outlet />
    </AppShell>
  );
}
