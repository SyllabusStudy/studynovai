import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, PartyPopper, Sparkles, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";
import { cn } from "@/lib/utils";

const GOALS = ["Staying organized", "Studying", "Understanding homework", "Improving grades", "All of the above"];

export function OnboardingTour() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);

  useEffect(() => {
    if (profile && profile.onboarding_done === false) setOpen(true);
  }, [profile]);

  async function finish(to?: "/classes" | "/dashboard") {
    setOpen(false);
    if (user) {
      await supabase.from("profiles").update({ onboarding_done: true, help_goals: goals }).eq("id", user.id);
      await qc.invalidateQueries({ queryKey: ["profile"] });
    }
    if (to) navigate({ to });
  }

  function toggleGoal(g: string) {
    if (g === "All of the above") return setGoals((c) => (c.includes(g) ? [] : [...GOALS]));
    setGoals((c) => (c.includes(g) ? c.filter((x) => x !== g && x !== "All of the above") : [...c, g]));
  }

  const steps = [
    {
      icon: Sparkles,
      title: "Welcome to StudyNova 👋",
      body: <p className="text-sm text-muted-foreground">Your semester, made simple. Let's set things up — it takes under a minute.</p>,
    },
    {
      icon: BookOpen,
      title: "What classes are you taking?",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Add each class once. Everything else — assignments, notes, quizzes — organizes around them.</p>
          <Button variant="outline" onClick={() => finish("/classes")}>Add Classes</Button>
        </div>
      ),
    },
    {
      icon: Upload,
      title: "Upload your syllabi",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Drop in a syllabus and StudyNova finds your assignments and exam dates, then puts them on your calendar.</p>
          <Button variant="outline" onClick={() => finish("/classes")}>Upload Syllabus</Button>
        </div>
      ),
    },
    {
      icon: Target,
      title: "What do you want help with?",
      body: (
        <div className="grid gap-2">
          {GOALS.map((g) => {
            const on = goals.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGoal(g)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm font-semibold transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                )}
              >
                {g}
                {on ? <Check className="size-4" /> : null}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      icon: PartyPopper,
      title: "You're all set!",
      body: <p className="text-sm text-muted-foreground">StudyNova built your semester workspace.</p>,
    },
  ];

  const current = steps[step]!;
  const Icon = current.icon;
  const last = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void finish(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-left text-xl">
            <Icon className="size-5 text-primary" />
            {current.title}
          </DialogTitle>
        </DialogHeader>
        {current.body}
        <div className="mt-2 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? <span /> : <Button variant="ghost" size="sm" onClick={() => finish()}>Skip</Button>}
          {last ? (
            <Button onClick={() => finish("/dashboard")}>Go to Dashboard</Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>{step === 0 ? "Let's go" : "Next"}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
