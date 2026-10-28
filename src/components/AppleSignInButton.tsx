import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";

/** "Continue with Apple" — required next to Google sign-in by App Store guideline 4.8. */
export function AppleSignInButton({
  redirectUri,
  onSignedIn,
  className = "w-full gap-2",
}: {
  redirectUri?: string;
  onSignedIn?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await lovable.auth.signInWithOAuth("apple", {
            redirect_uri: redirectUri ?? window.location.origin,
          });
          if (result.redirected) return;
          if (result.error) {
            toast.error("We couldn't sign you in with Apple. Please try again.");
            return;
          }
          onSignedIn?.();
        } catch {
          toast.error("We couldn't sign you in with Apple. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.37 12.63c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66ZM14.1 5.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.78 1.02.08 2.05-.52 2.68-1.27Z" />
        </svg>
      )}
      Continue with Apple
    </Button>
  );
}
