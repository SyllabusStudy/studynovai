import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PRO_PRICE_USD, FREE_LIMITS } from "@/lib/plan";
import { Input } from "@/components/ui/input";
import { cancelProPlan, confirmProCheckout, getBilling, redeemPromo, startProCheckout } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade to Pro — StudyMate AI" },
      {
        name: "description",
        content: `Go unlimited for $${PRO_PRICE_USD}/month: unlimited classes, AI assignment help and SnapQuick scans.`,
      },
      { property: "og:title", content: "Upgrade to StudyMate AI Pro" },
      { property: "og:description", content: "Unlimited classes, AI assignment help and photo scans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UpgradePage,
});

function UpgradePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = useServerFn(startProCheckout);
  const confirm = useServerFn(confirmProCheckout);
  const cancel = useServerFn(cancelProPlan);
  const loadBilling = useServerFn(getBilling);
  const redeem = useServerFn(redeemPromo);
  const [promo, setPromo] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing", user?.id],
    enabled: !!user,
    queryFn: () => loadBilling({}),
  });

  // PayPal sends the student back here with ?subscription_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionId = params.get("subscription_id");
    if (!subscriptionId) return;
    window.history.replaceState({}, "", "/upgrade");
    void (async () => {
      setBusy(true);
      try {
        const res = await confirm({ data: { subscriptionId } });
        await qc.invalidateQueries({ queryKey: ["billing"] });
        if (res.plan === "pro") toast.success("You're on Pro — everything is unlimited now.");
        else toast.error(`PayPal reported the subscription as ${res.status.toLowerCase()}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not confirm your subscription.");
      } finally {
        setBusy(false);
      }
    })();
  }, [confirm, qc]);

  async function upgrade() {
    setBusy(true);
    try {
      const { approveUrl } = await start({ data: { origin: window.location.origin } });
      window.location.href = approveUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start PayPal checkout.");
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await cancel({});
      await qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Subscription cancelled.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPromo() {
    if (!promo.trim()) return;
    setRedeeming(true);
    try {
      await redeem({ data: { code: promo.trim() } });
      await qc.invalidateQueries({ queryKey: ["billing"] });
      setPromo("");
      toast.success("Promo applied — everything is unlimited for you.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply that code.");
    } finally {
      setRedeeming(false);
    }
  }

  const pro = billing?.plan === "pro";
  const promoPlan = billing?.status === "promo";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plans & billing"
        description="Start free, go unlimited whenever you're ready. Paid securely with PayPal."
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="surface-card space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold">Free</p>
              <p className="mt-1 text-2xl font-bold">$0</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <Item>{FREE_LIMITS.classes} classes</Item>
              <Item>{FREE_LIMITS.assignment_help} AI assignment helps per day</Item>
              <Item>{FREE_LIMITS.snap} SnapQuick photo scans per day</Item>
              <Item>Syllabus import, calendar, flashcards & quizzes</Item>
            </ul>
            {billing && !pro ? (
              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                <p>
                  Today: {billing.usage.assignment_help}/{FREE_LIMITS.assignment_help} assignment helps ·{" "}
                  {billing.usage.snap}/{FREE_LIMITS.snap} scans
                </p>
                <p className="mt-1">
                  Classes: {billing.usage.classes}/{FREE_LIMITS.classes}
                </p>
              </div>
            ) : null}
          </div>

          <div className="surface-card space-y-4 border-primary/40 p-5 ring-1 ring-primary/20">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Crown className="size-4 text-primary" /> Pro
              </p>
              <p className="mt-1 text-2xl font-bold">
                ${PRO_PRICE_USD}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <Item>Unlimited classes</Item>
              <Item>Unlimited AI assignment help</Item>
              <Item>Unlimited SnapQuick photo scans</Item>
              <Item>Unlimited tutor chats, flashcards & quizzes</Item>
            </ul>
            {pro ? (
              <div className="space-y-3">
                <p className="text-xs text-success">
                  {promoPlan ? "Pro unlocked with a promo code" : "Pro is active"}
                  {billing?.currentPeriodEnd
                    ? ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                    : ""}
                </p>
                {promoPlan ? null : (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void stop()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Cancel subscription
                  </Button>
                )}
              </div>
            ) : (
              <Button className="w-full" disabled={busy} onClick={() => void upgrade()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Upgrade with PayPal
              </Button>
            )}
          </div>
        </div>
      )}

      {pro ? null : (
        <div className="surface-card mt-4 space-y-3 p-5">
          <div>
            <p className="text-sm font-semibold">Enter promo code</p>
            <p className="text-xs text-muted-foreground">Have a code? Redeem it for free access.</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Promo code"
              aria-label="Promo code"
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyPromo();
              }}
            />
            <Button variant="secondary" disabled={redeeming || !promo.trim()} onClick={() => void applyPromo()}>
              {redeeming ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply
            </Button>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Billing is handled by PayPal. Cancel anytime — you keep Pro until the end of the paid month.{" "}
        <button className="underline" onClick={() => navigate({ to: "/settings" })}>
          Back to settings
        </button>
      </p>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}
