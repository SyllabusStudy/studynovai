import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiRetryNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground">
      <span className="min-w-0 flex-1">{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RotateCw className="size-3.5" /> Try Again
      </Button>
    </div>
  );
}