import { useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAiKeyStatus } from "@/lib/ai-keys.functions";
import { supabase } from "@/integrations/supabase/client";

/** Deep link that scrolls to and highlights the AI key card in Settings. */
export const AI_KEY_SETTINGS_LINK = "/settings?setup=ai-key#ai-key";

/** True when a failure is really "this student has no usable AI key yet". */
export function isAiKeyIssue(message: string | null | undefined): boolean {
  if (!message) return false;
  return /Settings\s*(→|->)\s*AI key/i.test(message);
}

/** Whether the signed-in student has stored their own AI key. */
export function useAiKeyStatus() {
  const status = useServerFn(getAiKeyStatus);
  return useQuery({
    queryKey: ["ai-key"],
    queryFn: async () => {
      // Guests (signed out) have no key and no session — skip the server call.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return status({ data: undefined });
    },
    staleTime: 15_000,
    // While on the free trial, re-check so the app locks right after the last free use.
    refetchInterval: (q) => (q.state.data && q.state.data.hasKey === false ? 20_000 : false),
  });
}

/**
 * Sends the student straight to the AI key box in Settings instead of leaving
 * them with an error they can't act on.
 */
export function useSendToAiKeySetup() {
  const navigate = useNavigate();
  return useCallback(
    (message?: string) => {
      toast.error(message ?? "No AI key yet — taking you to Settings to add one.");
      void navigate({ to: "/settings", search: { setup: "ai-key" }, hash: "ai-key" });
    },
    [navigate],
  );
}

/**
 * Handles an AI failure: if the key is the problem, redirect to Settings and
 * report true so callers skip their own error handling.
 */
export function useAiKeyRedirect() {
  const send = useSendToAiKeySetup();
  return useCallback(
    (message: string | null | undefined) => {
      if (!isAiKeyIssue(message)) return false;
      send(message && /Switch your key/i.test(message) ? message : undefined);
      return true;
    },
    [send],
  );
}

/** Banner shown at the top of AI pages when no key is saved yet. */
export function AiKeySetupBanner({ className }: { className?: string }) {
  const { data, isLoading } = useAiKeyStatus();
  if (isLoading || data?.hasKey !== false) return null;
  const left = data.trial?.tools ?? 0;

  return (
    <section
      className={`surface-card mb-4 flex flex-col gap-3 border-l-4 border-l-primary p-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/12 p-2 text-primary">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {left > 0 ? `✨ ${left} free AI ${left === 1 ? "action" : "actions"} left` : "AI key needed to get started"}
          </p>
          <p className="text-xs text-muted-foreground">
            {left > 0
              ? "Try SnapQuick, QuickVideo, Syllabus or Humanizer free. Then turn on your own free AI to keep going."
              : "Add a free Google Gemini key (or OpenAI / Anthropic) to start using this tool."}
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/settings" search={{ setup: "ai-key" }} hash="ai-key">
          Set up key in Settings
        </Link>
      </Button>
    </section>
  );
}
