// Where the Windows desktop companion zip is hosted (GitHub Releases, built by
// .github/workflows/build-desktop.yml). Empty until the release link is set.
export const DESKTOP_DOWNLOAD_URL = "";

/** True inside the Electron desktop app, iOS shell, or on phones — hide the offer there. */
export function hideDesktopOffer(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const native = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  return /Electron/i.test(ua) || native || /iPhone|iPad|Android/i.test(ua);
}
