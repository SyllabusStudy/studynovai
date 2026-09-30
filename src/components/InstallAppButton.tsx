import { useEffect, useState } from "react";
import { Share, SquarePlus, Check, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstall } from "@/lib/pwa-install";
import logo from "@/assets/syllabusstudy-logo.png";

function IosSteps() {
  return (
    <ol className="space-y-3 text-sm">
      <li className="flex items-center gap-2">
        <Share className="size-4 text-primary" /> Tap the <strong>Share</strong> button in Safari.
      </li>
      <li className="flex items-center gap-2">
        <SquarePlus className="size-4 text-primary" /> Choose <strong>Add to Home Screen</strong>.
      </li>
      <li className="flex items-center gap-2">
        <Check className="size-4 text-primary" /> Tap <strong>Add</strong>. SyllabusStudy opens like an app.
      </li>
    </ol>
  );
}

function IosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Install SyllabusStudy on iPhone</DialogTitle>
          <DialogDescription>Safari installs it in three taps.</DialogDescription>
        </DialogHeader>
        <IosSteps />
      </DialogContent>
    </Dialog>
  );
}

export function InstallAppButton({ className }: { className?: string }) {
  const { available, canPrompt, install } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  if (!available) return null;
  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={className}
        onClick={() => (canPrompt ? void install() : setIosOpen(true))}
      >
        <Smartphone className="size-4" /> Install SyllabusStudy
      </Button>
      <IosDialog open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}

const DISMISS_KEY = "studynova-install-dismissed";

/** One-time install card. "Not now" hides it for 14 days; never shows once installed. */
export function InstallCard() {
  const { available, canPrompt, install } = useInstall();
  const [open, setOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (!available) return;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (Date.now() - at < 14 * 864e5) return;
      if (localStorage.getItem("studynova-installed")) return;
    } catch {
      return;
    }
    const t = setTimeout(() => {
      // Don't cover the first-run tour.
      if (document.querySelector("[data-tour-card]")) return;
      setOpen(true);
    }, 30000);
    return () => clearTimeout(t);
  }, [available]);

  function notNow() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!available) return null;
  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : notNow())}>
        <DialogContent className="max-w-sm text-center">
          <img src={logo} alt="SyllabusStudy" className="mx-auto size-20 rounded-2xl" />
          <DialogHeader className="items-center text-center">
            <DialogTitle className="font-display text-2xl">SyllabusStudy</DialogTitle>
            <DialogDescription>Your semester, made simple.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">📱 Install SyllabusStudy on your device. It opens from your home screen in its own window.</p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              size="lg"
              onClick={async () => {
                if (canPrompt) {
                  await install();
                  setOpen(false);
                } else {
                  setOpen(false);
                  setIosOpen(true);
                }
              }}
            >
              Install App
            </Button>
            <Button variant="ghost" onClick={notNow}>Not now</Button>
          </div>
        </DialogContent>
      </Dialog>
      <IosDialog open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}
