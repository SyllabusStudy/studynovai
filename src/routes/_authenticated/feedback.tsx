import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackForm, FEEDBACK_STATUSES, categoryLabel } from "@/components/FeedbackForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback — SyllableStudy" },
      { name: "description", content: "Report a bug, request a feature or tell us what's confusing in SyllableStudy." },
      { property: "og:title", content: "Feedback — SyllableStudy" },
      { property: "og:description", content: "Help us improve SyllableStudy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user } = useAuth();
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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Help us improve SyllableStudy" description="Found a bug, got an idea, or something felt confusing? Tell us." />
      <div className="surface-card p-5 sm:p-6">
        <FeedbackForm page="/feedback" />
      </div>

      <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your submissions</h2>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : mine.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No feedback yet" description="Anything you send shows up here so you can track it." />
      ) : (
        <ul className="space-y-2">
          {mine.map((f) => (
            <li key={f.id} className="surface-card min-w-0 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{categoryLabel(f.category ?? f.topic)}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(f.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{f.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status: {FEEDBACK_STATUSES.find((s) => s.value === f.status)?.label ?? f.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
