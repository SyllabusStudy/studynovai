import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { correctionKind, type NoteCorrection } from "@/lib/note-corrections";

export function NoteCorrectionPopover({ suggestion, anchor, onAccept, onReject, onClose }: {
  suggestion: NoteCorrection | undefined;
  anchor: HTMLElement | null;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  return <Popover open={!!suggestion && !!anchor} onOpenChange={open => { if (!open) onClose(); }}>
    <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => anchor?.getBoundingClientRect() ?? new DOMRect() } }} />
    <PopoverContent side="top" align="start" sideOffset={8} collisionPadding={12} className="z-[100] w-80 max-w-[calc(100vw-24px)]" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} aria-label="Review note correction">
      {suggestion && <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{correctionKind(suggestion) === "spelling" ? "Spelling" : "Wording"}</span>
          <Button size="icon" variant="ghost" className="size-6" aria-label="Close correction" onClick={onClose}><X className="size-3.5" /></Button>
        </div>
        <p className="break-words text-sm font-semibold">{suggestion.suggestion}</p>
        {suggestion.reason && <p className="mt-1 break-words text-xs text-muted-foreground">{suggestion.reason}</p>}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onAccept}><Check className="size-4" />Accept</Button>
          <Button size="sm" variant="ghost" onClick={onReject}>Reject</Button>
        </div>
      </>}
    </PopoverContent>
  </Popover>;
}