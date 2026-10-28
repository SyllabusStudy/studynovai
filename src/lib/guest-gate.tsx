import { isNativeApp } from "@/lib/pwa";
import { AppleSignInButton } from "@/components/AppleSignInButton";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Tools a visitor can open and try before creating an account. */
export const GUEST_TOOL_PATHS = ["/snapquick", "/quickvideo", "/lectures", "/tutor", "/flashcards", "/calendar"] as const;

export function isGuestToolPath(pathname: string): boolean {
  return GUEST_TOOL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const DRAFT_KEY = "studynova:guest-draft";

export type GuestDraft = { tool: string; path: string; text?: string };

function readDraft(): GuestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as GuestDraft) : null;
  } catch {
    return null;
  }
}

export function saveGuestDraft(draft: GuestDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — the visitor just retypes */
  }
}

/** Where to send the student once they finish signing up, if they came from a tool. */
export function guestReturnPath(): string | null {
  const draft = readDraft();
  return draft?.path ?? null;
}

/** Reads and clears the saved draft for one tool. */
export function takeGuestDraft(tool: string): GuestDraft | null {
  const draft = readDraft();
  if (!draft || draft.tool !== tool) return null;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  return draft;
}

/** Restores whatever a visitor typed before they were asked to sign up. */
export function useRestoredGuestDraft(tool: string, apply: (text: string) => void) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user) return;
    const draft = takeGuestDraft(tool);
    if (draft?.text) apply(draft.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, tool]);
}

/**
 * Lets visitors use a tool, then asks them to create an account at the moment
 * they run it. Whatever they typed is kept so nothing is lost.
 */
export function useGuestGate(tool: string) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const isGuest = !loading && !user;

  const requireAccount = useCallback(
    (draft?: { text?: string }) => {
      if (!isGuest) return false;
      saveGuestDraft({
        tool,
        path: typeof window !== "undefined" ? window.location.pathname : `/${tool}`,
        ...(draft?.text ? { text: draft.text } : {}),
      });
      setOpen(true);
      return true;
    },
    [isGuest, tool],
  );

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="size-5" />
          </div>
          <DialogTitle>Create your free account to see this</DialogTitle>
          <DialogDescription>
            It takes about 30 seconds. We'll walk you through turning on free AI, then bring you
            right back here — what you typed is saved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <AppleSignInButton
            redirectUri={window.location.href}
            onSignedIn={() => {
              setOpen(false);
              toast.success("You're in! Your free uses are ready.");
            }}
          />
          {open && isNativeApp() ? null : (
          <Button
            className="w-full"
            disabled={googleBusy}
            onClick={async () => {
              setGoogleBusy(true);
              const { lovable } = await import("@/integrations/lovable/index");
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.href,
              });
              if (result.redirected) return;
              setGoogleBusy(false);
              if (result.error) {
                toast.error("Google sign-in didn't finish. Try again.");
                return;
              }
              setOpen(false);
              toast.success("You're in! Your free uses are ready.");
            }}
          >
            {googleBusy ? "Opening Google…" : "Continue with Google — 1 click"}
          </Button>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate({ to: "/auth", search: { mode: "signup" } })}
          >
            Sign up with email
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate({ to: "/auth", search: { mode: "login" } })}
          >
            I already have an account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { isGuest, requireAccount, dialog };
}
