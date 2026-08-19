import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/data";

const TOPICS = [
  { value: "syllabus", label: "Syllabus import" },
  { value: "calendar", label: "Calendar & dates" },
  { value: "ai_help", label: "AI help & SnapQuick" },
  { value: "general", label: "Something else" },
] as const;

const schema = z.object({
  topic: z.enum(["syllabus", "calendar", "ai_help", "general"]),
  message: z
    .string()
    .trim()
    .min(5, { message: "Tell us a little more (at least 5 characters)." })
    .max(2000, { message: "Please keep it under 2000 characters." }),
});

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback & questions — StudyMate AI" },
      {
        name: "description",
        content: "Ask questions or send suggestions about syllabus import, your calendar and AI help.",
      },
      { property: "og:title", content: "Feedback & questions — StudyMate AI" },
      { property: "og:description", content: "Send questions or ideas to the StudyMate AI team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [topic, setTopic] = useState<string>("syllabus");
  const [message, setMessage] = useState("");

  const { data: mine = [], isLoading } = useQuery({
    queryKey: ["feedback", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({ topic, message });
      const { error } = await supabase
        .from("feedback")
        .insert({ user_id: user!.id, topic: parsed.topic, message: parsed.message });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("");
      await qc.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Thanks — your note was sent.");
    },
    onError: (e) => {
      const msg =
        e instanceof z.ZodError ? (e.issues[0]?.message ?? "Please check your note.") : e instanceof Error ? e.message : "Could not send that.";
      toast.error(msg);
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Feedback & questions"
        description="Stuck on the syllabus import, a calendar date or an AI answer? Tell us and we'll fix it."
      />

      <div className="surface-card space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="topic">What is this about?</Label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger id="topic">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="message">Your question or suggestion</Label>
          <Textarea
            id="message"
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="For example: my syllabus dates imported a week off, or the AI skipped part of question 3."
          />
          <p className="text-xs text-muted-foreground">{message.trim().length}/2000</p>
        </div>

        <Button
          className="w-full sm:w-auto"
          disabled={send.isPending || message.trim().length < 5}
          onClick={() => send.mutate()}
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send feedback
        </Button>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Your submissions
      </h2>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : mine.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No feedback yet"
          description="Anything you send shows up here so you can track it."
        />
      ) : (
        <ul className="space-y-2">
          {mine.map((f) => (
            <li key={f.id} className="surface-card min-w-0 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {TOPICS.find((t) => t.value === f.topic)?.label ?? f.topic}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(f.created_at)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{f.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">Status: {f.status}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
