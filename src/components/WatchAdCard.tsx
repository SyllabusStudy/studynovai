import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { claimAdReward } from "@/lib/ads.functions";
import { USAGE_LABELS, type UsageKind } from "@/lib/plan";
import { rewardedAdsAvailable, showRewardedAd } from "@/lib/rewarded-ad";

/** Free-plan card on the Upgrade page: watch a rewarded video for +1 use of a tool (iPhone app only). */
export function WatchAdCard() {
  const [canAd, setCanAd] = useState(false);
  const [busy, setBusy] = useState<UsageKind | null>(null);
  const claim = useServerFn(claimAdReward);
  const qc = useQueryClient();
  useEffect(() => setCanAd(rewardedAdsAvailable()), []);
  if (!canAd) return null;

  const watch = async (kind: UsageKind) => {
    setBusy(kind);
    try {
      const done = await showRewardedAd();
      if (!done) { toast.error("The video didn't finish, so no extra use was added."); return; }
      await claim({ data: { kind } });
      await qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success(`Unlocked 1 extra ${USAGE_LABELS[kind]}!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load a video right now. Try again soon.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="surface-card space-y-3 p-5 sm:col-span-2">
      <div className="flex items-center gap-2">
        <PlayCircle className="size-5 text-primary" />
        <p className="text-sm font-semibold">Watch a short video for 1 free use</p>
      </div>
      <p className="text-xs text-muted-foreground">Pick a tool — after the video finishes you get one extra use right away.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(USAGE_LABELS) as UsageKind[]).map((k) => (
          <Button key={k} variant="secondary" disabled={busy !== null} onClick={() => void watch(k)}>
            <PlayCircle className="size-4" /> {busy === k ? "Loading video…" : `+1 ${USAGE_LABELS[k]}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
