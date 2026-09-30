import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Props = {
  /** What is being cleared, e.g. "saved chats" */
  label: string;
  /** Extra explanation shown in the confirmation dialog. */
  description?: string;
  count?: number;
  buttonLabel?: string;
  className?: string;
  onClear: () => Promise<void>;
};

export function ClearAllButton({
  label,
  description,
  count,
  buttonLabel = "Clear all",
  className,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onClear();
      toast.success(`All ${label} deleted`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete everything");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive", className)}
        >
          <Trash2 className="size-3.5" /> {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete all {label}
            {typeof count === "number" ? ` (${count})` : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? `Every one of your ${label} will be removed from your account. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Delete all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
