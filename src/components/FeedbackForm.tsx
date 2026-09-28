import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Loader2, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const FEEDBACK_CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature Request" },
  { value: "confusing", label: "Confusing / Hard to Use" },
  { value: "ai_issue", label: "AI Issue" },
  { value: "other", label: "Other" },
] as const;

export const FEEDBACK_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In Review" },
  { value: "resolved", label: "Resolved" },
] as const;

export function categoryLabel(v: string) {
  const legacy: Record<string, string> = { ai_help: "AI Issue", syllabus: "Syllabus import", calendar: "Calendar", general: "Other" };
  return FEEDBACK_CATEGORIES.find((c) => c.value === v)?.label ?? legacy[v] ?? v;
}

export function FeedbackForm({ onSent, page }: { onSent?: () => void; page?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [category, setCategory] = useState<string>("bug");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);

  const send = useMutation({
    mutationFn: async () => {
      const text = message.trim();
      if (text.length < 5) throw new Error("Tell us a little more (at least 5 characters).");
      const { error } = await supabase.from("feedback").insert({
        user_id: user!.id,
        user_email: user!.email ?? null,
        topic: category,
        category,
        message: text.slice(0, 2000),
        rating: rating || null,
        page: page ?? pathname,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("");
      setRating(0);
      await qc.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Thanks — your feedback was sent.");
      onSent?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send that."),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Type</Label>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_CATEGORIES.map((c) => (
            <Button
              key={c.value}
              type="button"
              size="sm"
              variant={category === c.value ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fb-message">Message</Label>
        <Textarea
          id="fb-message"
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, or what would make StudyNova better?"
        />
      </div>
      <div className="space-y-2">
        <Label>How would you rate your experience? (optional)</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n === rating ? 0 : n)}
              className="rounded p-1"
            >
              <Star className={cn("size-6", n <= rating ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>
      <Button className="w-full sm:w-auto" disabled={send.isPending || message.trim().length < 5} onClick={() => send.mutate()}>
        {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Send Feedback
      </Button>
    </div>
  );
}
