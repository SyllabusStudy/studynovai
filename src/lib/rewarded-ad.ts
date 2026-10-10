import { ADMOB_REWARDED_IOS } from "./plan";

type AdMobPlugin = {
  initialize: (o?: Record<string, unknown>) => Promise<void>;
  requestTrackingAuthorization?: () => Promise<unknown>;
  prepareRewardVideoAd: (o: { adId: string }) => Promise<unknown>;
  showRewardVideoAd: () => Promise<{ type?: string; amount?: number } | undefined>;
};

function plugin(): AdMobPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return (cap.Plugins?.AdMob as AdMobPlugin) ?? null;
}

/** True only inside the iPhone app with the AdMob plugin available. */
export function rewardedAdsAvailable() {
  return !!plugin();
}

let ready = false;

/** Plays a rewarded video. Resolves true only when the ad finished and granted its reward. */
export async function showRewardedAd(): Promise<boolean> {
  const ad = plugin();
  if (!ad) return false;
  if (!ready) {
    await ad.initialize({});
    await ad.requestTrackingAuthorization?.().catch(() => undefined);
    ready = true;
  }
  await ad.prepareRewardVideoAd({ adId: ADMOB_REWARDED_IOS });
  const reward = await ad.showRewardVideoAd();
  return !!reward;
}
