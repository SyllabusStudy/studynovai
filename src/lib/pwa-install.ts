import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/pwa";

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// The browser fires this event once, early — capture it globally so any button can use it later.
let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    try {
      localStorage.setItem("studynova-installed", "1");
    } catch {
      /* ignore */
    }
    notify();
  });
}

export function useInstall() {
  const [, force] = useState(0);
  const [env, setEnv] = useState({ standalone: true, ios: false });
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setEnv({ standalone: isStandalone(), ios: isIos() });
    const media = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setEnv({ standalone: isStandalone(), ios: isIos() });
    media.addEventListener("change", onMode);
    return () => {
      listeners.delete(l);
      media.removeEventListener("change", onMode);
    };
  }, []);

  const isInstalled = env.standalone || installed;
  const canPrompt = !!deferred && !isInstalled;
  const showIosHelp = env.ios && !isInstalled;

  async function install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferred) return "unavailable";
    const e = deferred;
    await e.prompt();
    const choice = await e.userChoice.catch(() => null);
    deferred = null;
    if (choice?.outcome === "accepted") installed = true;
    notify();
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  }

  return { isInstalled, canPrompt, showIosHelp, available: canPrompt || showIosHelp, install };
}
