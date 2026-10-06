import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TutorChat } from "@/components/TutorChat";
import { useDraggable } from "@/lib/use-draggable";

export function AskAiDock() {
  const [open, setOpen] = useState(false);
  const drag = useDraggable("studynova:drag-askai");

  return (
    <>
      <Button
        {...drag.dragProps}
        onClick={() => { if (!drag.wasDrag()) setOpen(true); }}
        className="fixed bottom-20 right-4 z-40 in-data-[help=open]:hidden h-12 gap-2 rounded-full px-5 shadow-[var(--shadow-float)] lg:bottom-6 lg:right-6"
      >
        <Bot className="size-5" />
        Ask AI
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 pt-[max(8rem,calc(env(safe-area-inset-top)+7rem))] sm:max-w-md sm:pt-6" closeClassName="top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] sm:top-4">
          <SheetHeader className="pb-2">
            <SheetTitle>SyllabusStudy tutor</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <TutorChat compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
