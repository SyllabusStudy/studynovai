import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/DeleteButton";
import { ClearAllButton } from "@/components/ClearAllButton";
import { useAuth } from "@/lib/auth";
import { formatDate, useConversations, type ConversationRow } from "@/lib/data";
import { cn } from "@/lib/utils";

export function TutorHistory({
  activeId,
  onOpen,
  onNew,
}: {
  activeId: string | null;
  onOpen: (conversation: ConversationRow) => void;
  onNew: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: conversations = [] } = useConversations(user?.id);

  async function remove(id: string) {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["conversations", user?.id] });
    if (id === activeId) onNew();
  }

  async function removeAll() {
    if (!user?.id) return;
    const { error } = await supabase.from("ai_conversations").delete().eq("user_id", user.id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    onNew();
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Saved chats
        </p>
        <div className="flex items-center gap-1">
          {conversations.length ? (
            <ClearAllButton
              label="saved chats"
              count={conversations.length}
              description="Every saved chat and its messages will be removed from your account. This can't be undone."
              onClear={removeAll}
            />
          ) : null}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onNew}>
            <Plus className="size-3.5" /> New chat
          </Button>
        </div>
      </div>

      {conversations.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Your chats save automatically so you can come back to them later.
        </p>
      ) : (
        <div className="scroll-slim mt-2 max-h-48 space-y-1 overflow-y-auto lg:max-h-[70vh]">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-1 transition-colors",
                c.id === activeId
                  ? "border-primary/40 bg-primary/10"
                  : "border-transparent hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
              >
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{c.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {formatDate(c.updated_at)}
                  </span>
                </span>
              </button>
              <DeleteButton
                label="this chat"
                description="This chat and its messages will be removed from your account."
                onDelete={() => remove(c.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
