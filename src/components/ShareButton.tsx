import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function ShareButton({
  kind,
  refId,
  title,
  payload,
}: {
  kind: "deck" | "quiz";
  refId: string;
  title: string;
  payload: () => Json;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function share() {
    if (!user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("shared_items")
        .upsert({ user_id: user.id, kind, ref: refId, title, payload: payload() }, { onConflict: "user_id,kind,ref" })
        .select("token")
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/share/${data.token}`;
      if (navigator.share) {
        await navigator.share({ title: `${title} — SyllabusNova`, url }).catch(() => undefined);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied — send it to your classmates");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void share()}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
      Share {kind === "deck" ? "deck" : "quiz"}
    </Button>
  );
}
