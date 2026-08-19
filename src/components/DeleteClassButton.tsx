import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { deleteClassCascade } from "@/lib/data";

export function DeleteClassButton({
  classId,
  className: courseName,
  variant = "button",
  redirectTo,
}: {
  classId: string;
  className: string;
  variant?: "button" | "icon";
  redirectTo?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!user) return;
    setBusy(true);
    try {
      await deleteClassCascade(user.id, classId);
      await qc.invalidateQueries();
      toast.success(`Deleted "${courseName}"`);
      setOpen(false);
      if (redirectTo) void navigate({ to: redirectTo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete this class");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Delete ${courseName}`}
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" /> Delete class
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{courseName}"?</DialogTitle>
            <DialogDescription>
              This removes the class along with its documents, deadlines, calendar dates, flashcards, quizzes
              and grade weights. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep class
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
