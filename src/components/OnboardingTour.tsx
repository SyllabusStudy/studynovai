import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { TOUR_EVENT, TOUR_STEPS, type TourEventDetail } from "@/lib/tour";

// Steps 0..N-1 are real-app steps, N is the final "ready" screen.
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

/** Another real dialog/sheet (e.g. Add class) is open — step aside so the user can use it. */
function otherDialogOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"]:not([data-tour-card])');
}

export function OnboardingTour() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const key = user ? `studynova-tour-step-${user.id}` : "";

  // "tour" = full walkthrough, "focus" = mini walkthrough from Help (ends at `focusEnd`)
  const [mode, setMode] = useState<"off" | "tour" | "focus">("off");
  const [step, setStepState] = useState(0);
  const [focusEnd, setFocusEnd] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [paused, setPaused] = useState(false);
  const [mobileHint, setMobileHint] = useState<string | null>(null);
  const [cardPos, setCardPos] = useState<CSSProperties>({ left: -9999, top: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const mandatory = profile?.onboarding_done === false;

  useEffect(() => {
    if (!user) return;
    localStorage.removeItem(`studynova-onboarding-step-${user.id}`);
  }, [user]);

  // New accounts: start (or resume) the tour.
  useEffect(() => {
    if (mandatory && key && mode === "off") {
      const saved = Number(localStorage.getItem(key) || 0);
      setStepState(Number.isFinite(saved) ? Math.min(Math.max(saved, 0), FINAL) : 0);
      setMode("tour");
    }
  }, [mandatory, key, mode]);

  // Help panel: replay tour or a mini walkthrough.
  useEffect(() => {
    const onStart = (e: Event) => {
      const { focus } = (e as CustomEvent<TourEventDetail>).detail ?? {};
      if (focus) {
        const i = TOUR_STEPS.findIndex((s) => s.id === focus);
        if (i < 0) return;
        let end = i;
        while (end < FINAL - 1 && TOUR_STEPS[end]!.kind === "click") end++;
        setStepState(i);
        setFocusEnd(end);
        setMode("focus");
      } else {
        setStepState(0);
        setMode("tour");
      }
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  const setStep = useCallback(
    (n: number) => {
      if (mode === "focus" && n > focusEnd) return setMode("off");
      setStepState(n);
      if (key && mode === "tour" && mandatory) localStorage.setItem(key, String(n));
    },
    [mode, focusEnd, key, mandatory],
  );

  const current = mode !== "off" && step < FINAL ? TOUR_STEPS[step]! : null;

  // "click" steps advance when the user lands on the destination page.
  useEffect(() => {
    if (current?.kind === "click" && current.goto && pathname.startsWith(current.goto)) setStep(step + 1);
  }, [current, pathname, step, setStep]);

  // Resume on the right page for "next" steps (e.g. after a refresh).
  useEffect(() => {
    if (current?.kind === "next" && current.route && pathname !== current.route) {
      navigate({ to: current.route as "/dashboard" });
    }
  }, [current, pathname, navigate]);

  // Find the real element, scroll to it, and keep tracking it as the page changes.
  useEffect(() => {
    if (!current) {
      setRect(null);
      targetRef.current = null;
      setMobileHint(null);
      return;
    }
    let scrolled = false;
    let lastKey = "";
    const tick = () => {
      const mobile = window.innerWidth < 1024;
      const menuOpen = !!document.querySelector('[role="dialog"][data-state="open"] nav');
      // Mobile: while teaching a menu tap, the open menu is part of the tour — don't step aside.
      const mobileClick = mobile && current.kind === "click";
      setPaused(mobileClick && menuOpen ? false : otherDialogOpen());
      let el = findTarget(current.selectors);
      let hint: string | null = null;
      if (!el && mobileClick) {
        const group = current.goto === "/tutor" || current.goto === "/flashcards" || current.goto === "/quizzes" ? "study" : null;
        if (menuOpen && group) {
          el = findTarget([`[role="dialog"] [data-tour-group="${group}"]`]);
          if (el) hint = "Tap Study to show more options.";
        }
        if (!el) {
          el = findTarget(['[aria-label="Open menu"]']);
          if (el) hint = "Tap the ☰ menu to open it.";
        }
      }
      setMobileHint(hint);
      targetRef.current = el;
      const k = el ? `${hint}` : "";
      if (el && (!scrolled || k !== lastKey)) {
        scrolled = true;
        lastKey = k;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setRect((prev) => {
        const r = el?.getBoundingClientRect() ?? null;
        if (!r && !prev) return prev;
        if (r && prev && r.top === prev.top && r.left === prev.left && r.width === prev.width && r.height === prev.height) return prev;
        return r;
      });
    };
    tick();
    const id = window.setInterval(tick, 200);
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
  }, [current, pathname]);

  // Keep the card on-screen and off the highlighted element.
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
    const midX = clampX(rect.left + rect.width / 2 - cw / 2);
    const midY = clampY(rect.top + rect.height / 2 - ch / 2);
    if (vw - rect.right - PAD >= cw + GAP + 12) setCardPos({ left: rect.right + PAD + GAP, top: midY });
    else if (vh - rect.bottom - PAD >= ch + GAP + 12) setCardPos({ left: midX, top: rect.bottom + PAD + GAP });
    else if (rect.top - PAD >= ch + GAP + 12) setCardPos({ left: midX, top: rect.top - PAD - GAP - ch });
    else if (rect.left - PAD >= cw + GAP + 12) setCardPos({ left: rect.left - PAD - GAP - cw, top: midY });
    else setCardPos({ left: clampX((vw - cw) / 2), top: vh - ch - 12 });
  }, [rect, step, mode]);

  async function complete() {
    if (user && mandatory) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("id", user.id);
      await qc.invalidateQueries({ queryKey: ["profile"] });
    }
    if (key) localStorage.removeItem(key);
    setMode("off");
    navigate({ to: "/dashboard" });
  }

  if (mode === "off" || paused) return null;

  const dim = "color-mix(in oklch, var(--background) 65%, transparent)";
  const total = TOUR_STEPS.length;
  const hole = rect
    ? { l: rect.left - PAD, t: rect.top - PAD, r: rect.right + PAD, b: rect.bottom + PAD }
    : null;
  const isClick = current?.kind === "click";

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite">
      {/* Click blockers around the spotlight — the highlighted element stays clickable. */}
      {hole ? (
        <>
          <div className="pointer-events-auto fixed left-0 right-0 top-0" style={{ height: Math.max(0, hole.t) }} />
          <div className="pointer-events-auto fixed bottom-0 left-0 right-0" style={{ top: hole.b }} />
          <div className="pointer-events-auto fixed left-0" style={{ top: hole.t, height: hole.b - hole.t, width: Math.max(0, hole.l) }} />
          <div className="pointer-events-auto fixed right-0" style={{ top: hole.t, height: hole.b - hole.t, left: hole.r }} />
          <div
            className="fixed rounded-xl ring-2 ring-primary transition-all duration-300"
            style={{
              left: hole.l,
              top: hole.t,
              width: hole.r - hole.l,
              height: hole.b - hole.t,
              boxShadow: `0 0 0 9999px ${dim}, 0 0 24px 4px color-mix(in oklch, var(--primary) 45%, transparent)`,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0" style={{ background: dim }} />
      )}

      <div
        ref={cardRef}
        role="dialog"
        data-tour-card
        aria-modal="false"
        aria-labelledby="tour-title"
        style={{ position: "fixed", ...cardPos }}
        className="surface-card pointer-events-auto w-[min(92vw,22rem)] p-5 shadow-2xl transition-[left,top] duration-300"
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
            {current.action ? <p className="mt-3 text-sm font-bold text-primary">{current.action}</p> : null}
            {isClick && !rect ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Can't see it? It's in the menu.</p>
                <Button size="sm" variant="secondary" onClick={() => navigate({ to: current.goto as "/dashboard" })}>
                  Take me there
                </Button>
              </div>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" disabled={step === 0 || mode === "focus"} onClick={() => {
                let p = step - 1;
                while (p > 0 && TOUR_STEPS[p]!.kind === "click") p--;
                setStep(Math.max(0, p));
              }}>
                Back
              </Button>
              <button
                type="button"
                onClick={() => {
                  // Skipping a click step also skips the page it leads to.
                  let n = step + 1;
                  if (isClick) while (n < FINAL && TOUR_STEPS[n]!.kind === "next" && TOUR_STEPS[n]!.route === current.goto) n++;
                  setStep(n);
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
              >
                Skip this step
              </button>
              {isClick ? (
                <span className="w-14" />
              ) : (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  {mode === "focus" && step >= focusEnd ? "Got it" : "Next"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="tour-title" className="text-xl font-extrabold tracking-tight">You're ready to use SyllableStudy! 🎉</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              If you ever get stuck, click the 💡 Stuck? button in the corner for help or to take this tour again.
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
