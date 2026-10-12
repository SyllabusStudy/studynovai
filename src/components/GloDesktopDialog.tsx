import { useEffect, useState } from "react";
import { Download, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DESKTOP_DOWNLOAD_URL, hideDesktopOffer } from "@/lib/desktop";

/** Optional "Expand Glo" offer — web Glo keeps working; the desktop app just adds more. */
export function GloDesktopDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Monitor className="size-5 text-primary" /> Expand Glo to your computer</DialogTitle>
          <DialogDescription>Glo still works right here. The free desktop app is optional and adds:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm text-foreground">
          <li>• Keeps listening when you click into other apps or tabs</li>
          <li>• Floats beside Canvas, PDFs, or Word</li>
          <li>• Press <strong>Ctrl + Shift + G</strong> to show or hide him anywhere</li>
          <li>• Updates by itself — nothing to reinstall</li>
        </ul>
        {DESKTOP_DOWNLOAD_URL ? (
          <Button asChild size="lg" className="gap-2">
            <a href={DESKTOP_DOWNLOAD_URL} download><Download className="size-4" /> Download for Windows</a>
          </Button>
        ) : (
          <Button size="lg" disabled>Download coming soon</Button>
        )}
        <p className="text-xs text-muted-foreground">Unzip it, then open <strong>SyllabusStudy.exe</strong>. If Windows warns you, click “More info” → “Run anyway.”</p>
      </DialogContent>
    </Dialog>
  );
}

/** Small button that opens the dialog; hidden on phones and inside the apps. */
export function GloDesktopButton({ className }: { className?: string }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setShow(!hideDesktopOffer()), []);
  if (!show) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"}>
        <Monitor className="size-3.5" /> Expand Glo to desktop
      </button>
      <GloDesktopDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
