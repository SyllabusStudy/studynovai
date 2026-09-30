import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { FREE_LIMITS, FREE_WINDOW_HOURS } from "@/lib/plan";
import { usePricing } from "@/lib/use-pricing";
import { money, savingsPercent } from "@/lib/pricing";
import { Input } from "@/components/ui/input";
import { cancelProPlan, confirmProCheckout, getBilling, redeemPromo } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { getStripeEnvironment, PRO_PRICE_ID } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade to Pro — SyllableStudy" },
      {
        name: "description",
        content: "Get unlimited AI assignment help and SnapQuick scans with SyllableStudy Pro.",
      },
      { property: "og:title", content: "Upgrade to SyllableStudy Pro" },
      { property: "og:description", content: "Unlimited AI assignment help and photo scans." },
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const confirm = useServerFn(confirmProCheckout);
  const cancel = useServerFn(cancelProPlan);
  const loadBilling = useServerFn(getBilling);
  const redeem = useServerFn(redeemPromo);
  const [promo, setPromo] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const pricing = usePricing();
  const savings = savingsPercent(pricing);

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing", user?.id],
    enabled: !!user,
    queryFn: () => loadBilling({}),
  });

  // Checkout returns the student here with ?session_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    window.history.replaceState({}, "", "/upgrade");
    void (async () => {
      setBusy(true);
      try {
        const res = await confirm({
          data: { sessionId, environment: getStripeEnvironment() },
        });
        await qc.invalidateQueries({ queryKey: ["billing"] });
        if (res.plan === "pro") toast.success("You're on Pro — everything is unlimited now.");
        else toast.error(`Your payment came back as ${res.status.toLowerCase()}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not confirm your subscription.");
      } finally {
        setBusy(false);
      }
    })();
  }, [confirm, qc]);

  async function stop() {
    setBusy(true);
    try {
      await cancel({ data: { environment: getStripeEnvironment() } });
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
  const nextReset = (() => {
    const times = Object.values(billing?.resets ?? {})
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime())
      .filter((t) => t > Date.now());
    if (!times.length) return null;
    const mins = Math.max(1, Math.ceil((Math.min(...times) - Date.now()) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  })();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plans & billing"
        description="Start free, go unlimited whenever you're ready. Secure card checkout."
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
              <Item>♾️ Unlimited classes</Item>
              <Item>🤖 {FREE_LIMITS.assignment_help} AI Assignment Helps every {FREE_WINDOW_HOURS} hours</Item>
              <Item>📸 {FREE_LIMITS.snap} SnapQuick photo scans every {FREE_WINDOW_HOURS} hours</Item>
              <Item>🎥 {FREE_LIMITS.video} QuickVideo imports every {FREE_WINDOW_HOURS} hours</Item>
              <Item>📄 Syllabus Import</Item>
              <Item>📅 Calendar</Item>
              <Item>🃏 Flashcards & Quizzes</Item>
            </ul>
            {billing && !pro ? (
              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                <p>
                  Last {FREE_WINDOW_HOURS}h: {billing.usage.assignment_help}/{FREE_LIMITS.assignment_help} assignment helps ·{" "}
                  {billing.usage.snap}/{FREE_LIMITS.snap} scans ·{" "}
                  {billing.usage.video}/{FREE_LIMITS.video} video imports
                </p>
                <p className="mt-1">Classes: {billing.usage.classes} (unlimited)</p>

                {nextReset ? (
                  <p className="mt-1">Next free use unlocks in {nextReset}.</p>
                ) : null}
              </div>
            ) : null}
            {pro ? (
              <Button variant="outline" className="w-full" disabled={busy} onClick={() => void stop()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Go back to Free plan
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">You're on the Free plan.</p>
            )}
          </div>


          <div className="surface-card space-y-4 border-primary/40 p-5 ring-1 ring-primary/20">
            <div>
              {pricing.saleActive ? (
                <span className="mb-2 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {pricing.saleLabel}
                  {savings ? ` · save ${savings}%` : ""}
                </span>
              ) : null}
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Crown className="size-4 text-primary" /> Pro
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-2">
                {pricing.saleActive && pricing.comparePriceUsd ? (
                  <span className="text-base text-muted-foreground line-through">
                    {money(pricing.comparePriceUsd)}
                  </span>
                ) : null}
                <span className="text-2xl font-bold">{money(pricing.priceUsd)}</span>
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              {pricing.saleNote ? (
                <p className="mt-1 text-xs text-muted-foreground">{pricing.saleNote}</p>
              ) : null}
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <Item>Everything in Free, plus:</Item>
              <Item>Unlimited AI assignment help</Item>
              <Item>Unlimited SnapQuick photo scans</Item>
              <Item>Unlimited tutor chats, flashcards & quizzes</Item>
              <Item>Unlimited QuickVideo imports</Item>
              <Item>✨ AI Humanize</Item>
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
              <Button
                className="w-full"
                disabled={busy || checkoutOpen}
                onClick={() => setCheckoutOpen(true)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
      )}

      {!pro && checkoutOpen ? (
        <div className="surface-card mt-4 p-4">
          <PaymentTestModeBanner />
          <StripeEmbeddedCheckout
            priceId={PRO_PRICE_ID}
            returnUrl={`${window.location.origin}/upgrade?session_id={CHECKOUT_SESSION_ID}`}
          />
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setCheckoutOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}

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
        Billing is secure and card-based. Cancel anytime — you keep Pro until the end of the paid month.{" "}
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
