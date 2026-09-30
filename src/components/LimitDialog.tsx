import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EVENT = "syllabusstudy:limit";

export function isQuotaMessage(msg: unknown): msg is string {
  return typeof msg === "string" && msg.startsWith("You've hit your free limit");
}

/** Opens the Get Pro popup when the message is a free-plan limit. Returns true if shown. */
export function showLimitIfQuota(msg: unknown): boolean {
  if (!isQuotaMessage(msg) || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: msg }));
  return true;
}

export function LimitDialog() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMsg((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const main = msg?.split(". Try again")[0];
  const wait = msg?.match(/Try again in ([^,]+)/)?.[1];
  return (
    <Dialog open={msg !== null} onOpenChange={(o) => !o && setMsg(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Get Pro for unlimited use
          </DialogTitle>
          <DialogDescription>{main?.replace("You've hit", "You've reached")}.</DialogDescription>
        </DialogHeader>
        {wait ? <p className="text-sm text-muted-foreground">Your next free use is ready in <strong className="text-foreground">{wait}</strong>. Your work is still here.</p> : null}
        <p className="text-sm text-muted-foreground">Pro unlocks unlimited snaps, lecture notes, video imports and assignment help.</p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setMsg(null)}>Maybe later</Button>
          <Button asChild onClick={() => setMsg(null)}>
            <Link to="/upgrade">Upgrade to Pro</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
