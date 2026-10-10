import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PlayCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { claimAdReward } from "@/lib/ads.functions";
import { USAGE_LABELS, type UsageKind } from "@/lib/plan";
import { rewardedAdsAvailable, showRewardedAd } from "@/lib/rewarded-ad";

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
  const [canAd, setCanAd] = useState(false);
  const [busy, setBusy] = useState(false);
  const claim = useServerFn(claimAdReward);
  useEffect(() => {
    const on = (e: Event) => { setMsg((e as CustomEvent<string>).detail); setCanAd(rewardedAdsAvailable()); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const main = msg?.split(". Try again")[0];
  const wait = msg?.match(/Try again in ([^,]+)/)?.[1];
  const kind = (Object.keys(USAGE_LABELS) as UsageKind[]).find((k) => msg?.includes(USAGE_LABELS[k]));
  const watch = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const done = await showRewardedAd();
      if (!done) { toast.error("The video didn't finish, so no extra use was added."); return; }
      await claim({ data: { kind } });
      toast.success("Unlocked 1 extra use — go ahead and try again!");
      setMsg(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load a video right now. Try again soon.");
    } finally {
      setBusy(false);
    }
  };
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
        <p className="text-sm text-muted-foreground">Pro unlocks unlimited snaps, lecture notes, video imports and assignment help — with no ads.</p>
        {canAd && kind ? (
          <Button variant="secondary" className="w-full" disabled={busy} onClick={watch}>
            <PlayCircle className="size-4" /> {busy ? "Loading video…" : "Watch a short video for 1 free use"}
          </Button>
        ) : null}
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
