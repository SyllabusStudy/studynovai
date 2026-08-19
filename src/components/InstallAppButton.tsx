import { useEffect, useState } from "react";
import { Share, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isIos, isStandalone } from "@/lib/pwa";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallAppButton({ className }: { className?: string }) {
  const [installed, setInstalled] = useState(true);
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const onModeChange = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener("change", onModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onModeChange);
    };
  }, []);

  // Already running as an installed app — nothing to prompt.
  if (installed) return null;
  // No native prompt available and not iOS (e.g. desktop Firefox): stay quiet.
  if (!promptEvent && !ios) return null;

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={className}
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice.catch(() => null);
            if (choice?.outcome === "accepted") setInstalled(true);
            setPromptEvent(null);
            return;
          }
          setShowIosHelp(true);
        }}
      >
        <Smartphone className="size-4" /> Install StudyMate AI
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add StudyMate AI to your Home Screen</DialogTitle>
            <DialogDescription>Two taps in Safari and it works like a real app.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <Share className="size-4 text-primary" /> Tap the <strong>Share</strong> button in Safari.
            </li>
            <li className="flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Choose <strong>Add to Home Screen</strong>.
            </li>
            <li className="flex items-center gap-2">
              <Smartphone className="size-4 text-primary" /> Tap <strong>Add</strong> — done.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
