import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { TOUR_EVENT, TOUR_STEPS, type TourEventDetail } from "@/lib/tour";

// Steps 0..N-1 are spotlight steps, N is the final "ready" screen.
const FINAL = TOUR_STEPS.length;
const PAD = 6;
const GAP = 14;

function findTarget(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export function OnboardingTour() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const key = user ? `studynova-tour-step-${user.id}` : "";

  // mode "tour" = full walkthrough, "focus" = single highlight from Help
  const [mode, setMode] = useState<"off" | "tour" | "focus">("off");
  const [step, setStepState] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<CSSProperties>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const mandatory = profile?.onboarding_done === false;

  // Clean up the retired onboarding key.
  useEffect(() => {
    if (user) localStorage.removeItem(`studynova-onboarding-step-${user.id}`);
  }, [user]);

  useEffect(() => {
    if (mandatory && key && mode === "off") {
      const saved = Number(localStorage.getItem(key) || 0);
      setStepState(Number.isFinite(saved) ? Math.min(Math.max(saved, 0), FINAL) : 0);
      setMode("tour");
    }
  }, [mandatory, key, mode]);

  useEffect(() => {
    const onStart = (e: Event) => {
      const { focus } = (e as CustomEvent<TourEventDetail>).detail ?? {};
      if (focus) {
        const i = TOUR_STEPS.findIndex((s) => s.id === focus);
        if (i < 0) return;
        setStepState(i);
        setMode("focus");
      } else {
        setStepState(0);
        setMode("tour");
      }
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  // Tour lives on the dashboard where the real buttons are.
  useEffect(() => {
    if (mode !== "off" && pathname !== "/dashboard") navigate({ to: "/dashboard" });
  }, [mode, pathname, navigate]);

  function setStep(n: number) {
    setStepState(n);
    if (key && mode === "tour" && mandatory) localStorage.setItem(key, String(n));
  }

  const current = step < FINAL ? TOUR_STEPS[step]! : null;

  const measure = useCallback(() => {
    if (mode === "off" || !current) return setRect(null);
    const el = findTarget(current.selectors);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [mode, current]);

  useEffect(() => {
    if (mode === "off" || !current) return;
    let tries = 0;
    let timer: number;
    const locate = () => {
      const el = findTarget(current.selectors);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(measure, 350);
        measure();
      } else if (tries++ < 20) {
        timer = window.setTimeout(locate, 150);
      } else setRect(null);
    };
    locate();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [mode, current, measure, pathname]);

  // Position the card so it never covers the target or leaves the screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!rect) {
      setCardPos({ left: (vw - cw) / 2, top: Math.max(16, (vh - ch) / 2) });
      return;
    }
    const clampX = (x: number) => Math.min(Math.max(12, x), vw - cw - 12);
    const clampY = (y: number) => Math.min(Math.max(12, y), vh - ch - 12);
    if (vh - rect.bottom - PAD >= ch + GAP) {
      setCardPos({ left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.bottom + PAD + GAP });
    } else if (rect.top - PAD >= ch + GAP) {
      setCardPos({ left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.top - PAD - GAP - ch });
    } else if (vw - rect.right - PAD >= cw + GAP) {
      setCardPos({ left: rect.right + PAD + GAP, top: clampY(rect.top + rect.height / 2 - ch / 2) });
    } else if (rect.left - PAD >= cw + GAP) {
      setCardPos({ left: rect.left - PAD - GAP - cw, top: clampY(rect.top + rect.height / 2 - ch / 2) });
    } else {
      setCardPos({ left: clampX((vw - cw) / 2), top: vh - ch - 12 });
    }
  }, [rect, step, mode]);

  async function complete() {
    if (user && mandatory) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("id", user.id);
      await qc.invalidateQueries({ queryKey: ["profile"] });
    }
    if (key) localStorage.removeItem(key);
    setMode("off");
  }

  if (mode === "off") return null;

  const overlay = "color-mix(in oklch, var(--background) 65%, transparent)";
  const total = TOUR_STEPS.length;

  return (
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* Blocks clicks on the page while the tour runs */}
      <div className="absolute inset-0" style={rect ? undefined : { background: overlay }} />
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: `0 0 0 9999px ${overlay}, 0 0 24px 4px color-mix(in oklch, var(--primary) 45%, transparent)`,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        style={{ position: "fixed", ...cardPos }}
        className="surface-card w-[min(92vw,22rem)] p-5 shadow-2xl transition-all duration-300"
      >
        {current ? (
          <>
            {mode === "tour" ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Step {step + 1} of {total}
              </p>
            ) : null}
            <h2 id="tour-title" className="mt-1 text-lg font-extrabold tracking-tight">{current.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{current.body}</p>
            {!rect ? (
              <p className="mt-2 text-xs font-semibold text-primary">Open the menu to find it.</p>
            ) : null}
            {mode === "tour" ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
                  Back
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  Skip this step
                </button>
                <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>
              </div>
            ) : (
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={() => setMode("off")}>Got it</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 id="tour-title" className="text-xl font-extrabold tracking-tight">You're ready to study! 🎉</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You now know the basics of StudyNova. You can always find help if you get stuck.
            </p>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>Back</Button>
              <Button onClick={() => void complete()}>Start Studying</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
