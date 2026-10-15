import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getCreatorStats } from "@/lib/referral.functions";
import { CreatorOutreach } from "./CreatorOutreach";

const PRICE = 5.99;

export function AdminCreators() {
  const load = useServerFn(getCreatorStats);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-creators"], queryFn: () => load({}) });
  if (isLoading) return <Loader2 className="size-5 animate-spin text-primary" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  return (
    <div className="space-y-4">
      <CreatorOutreach />
      <p className="text-sm text-muted-foreground">
        Give each creator a link like <span className="font-semibold text-foreground">syllabusstudy.com/?ref=theirname</span>. Payout estimate = 25% of ${PRICE}/month per paying Pro student.
      </p>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">No referred sign-ups yet.</p>
      ) : (
        data.map((c) => (
          <details key={c.code} className="surface-card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-bold">{c.code}</span>
              <span className="text-sm">{c.signups} sign-ups</span>
              <span className="text-sm">{c.pro} paying Pro</span>
              <span className="text-sm font-semibold text-primary">≈ ${(c.pro * PRICE * 0.25).toFixed(2)}/mo owed</span>
            </summary>
            <ul className="mt-3 space-y-1 text-sm">
              {c.students.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 border-t border-border pt-1">
                  <span className="truncate">{s.email}</span>
                  <span className="text-muted-foreground">{new Date(s.joined).toLocaleDateString()} · {s.pro ? "Pro" : "Free"}</span>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </div>
  );
}
