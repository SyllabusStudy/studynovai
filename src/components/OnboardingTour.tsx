import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";

type Step = { to: string; emoji: string; title: string; body: string; cta: string };

const STEPS: Step[] = [
  { to: "/classes", emoji: "📚", title: "Step 1 — Add your classes", body: "Click My Classes to add your classes and upload your syllabi.", cta: "Got it" },
  { to: "/calendar", emoji: "📅", title: "Step 2 — Check your calendar", body: "Click Calendar to see every class, deadline and exam in one place.", cta: "Next" },
  { to: "/assignments", emoji: "✅", title: "Step 3 — Track assignments", body: "Click Assignments to add homework and mark it done when you finish.", cta: "Next" },
  { to: "/tutor", emoji: "🤖", title: "Step 4 — Study with AI", body: "Click AI Tutor to ask questions about your own class materials.", cta: "Next" },
];
// 0 = welcome, 1..4 = steps, 5 = done screen
const LAST = STEPS.length + 1;

function findTarget(to: string): DOMRect | null {
  const els = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href="${to}"]`));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export function OnboardingTour() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = user ? `studynova-onboarding-step-${user.id}` : "";
  const [open, setOpen] = useState(false);
  const [step, setStepState] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (profile && profile.onboarding_done === false && key) {
      const saved = Number(localStorage.getItem(key) || 0);
      setStepState(Number.isFinite(saved) ? Math.min(Math.max(saved, 0), LAST) : 0);
      setOpen(true);
    }
  }, [profile, key]);

  function setStep(n: number) {
    setStepState(n);
    if (key) localStorage.setItem(key, String(n));
  }

  const current = step >= 1 && step <= STEPS.length ? STEPS[step - 1]! : null;

  useEffect(() => {
    if (!open || !current) return setRect(null);
    const update = () => setRect(findTarget(current.to));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, current]);

  async function complete() {
    if (user) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("id", user.id);
      localStorage.removeItem(key);
      await qc.invalidateQueries({ queryKey: ["profile"] });
    }
    setOpen(false);
    navigate({ to: "/dashboard" });
  }

  if (!open) return null;

  // Place card next to the highlighted nav item on wide screens; centered otherwise.
  const side = rect && rect.right < window.innerWidth / 2;
  const cardStyle: React.CSSProperties = side
    ? { position: "fixed", left: rect!.right + 28, top: Math.max(16, Math.min(rect!.top + rect!.height / 2 - 90, window.innerHeight - 260)) }
    : {};

  const card = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={cardStyle}
      className="surface-card relative w-[min(92vw,26rem)] animate-fade-up p-6 shadow-2xl"
    >
      {side ? (
        <ArrowLeft className="absolute -left-9 top-1/2 size-8 -translate-y-1/2 animate-pulse text-primary" />
      ) : null}

      {step === 0 ? (
        <>
          <h2 id="onboarding-title" className="text-2xl font-extrabold tracking-tight">🎓 Welcome to StudyNova 👋</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Let's get your semester set up. We'll walk you through it — it only takes a minute.
          </p>
          <Button className="mt-6 w-full gap-2" size="lg" onClick={() => setStep(1)}>
            Let's Get Started <ArrowRight className="size-4" />
          </Button>
        </>
      ) : current ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {step} of {STEPS.length}
          </p>
          <h2 id="onboarding-title" className="mt-1 text-xl font-extrabold tracking-tight">
            {current.emoji} {current.title}
          </h2>
          {!side ? (
            <p className="mt-2 text-xs font-semibold text-primary">➡️ Find it in the menu</p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">{current.body}</p>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          <Button className="mt-5 w-full gap-2" onClick={() => setStep(step + 1)}>
            {current.cta} <ArrowRight className="size-4" />
          </Button>
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="mt-3 w-full text-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Skip this step
          </button>
        </>
      ) : (
        <>
          <h2 id="onboarding-title" className="text-2xl font-extrabold tracking-tight">🎉 You're all set!</h2>
          <p className="mt-2 text-sm text-muted-foreground">StudyNova is ready to help you study smarter. 🎓</p>
          <Button className="mt-6 w-full gap-2" size="lg" onClick={() => void complete()}>
            Start Studying <ArrowRight className="size-4" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-4 ring-primary shadow-[0_0_0_9999px_transparent]"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      ) : null}
      {side ? card : <div className="relative flex h-full items-center justify-center p-4">{card}</div>}
    </div>
  );
}
