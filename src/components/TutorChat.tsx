import { recordStudyActivity } from "@/lib/activity";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClassPicker } from "@/lib/active-class";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, SendHorizonal, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { tutorChat } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/Markdown";
import { STUDY_MODES } from "@/lib/constants";
import { classLabel, useClasses, type ConversationRow } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type ChatMsg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I study today?",
  "How many classes can I miss?",
  "What does my professor say about late work?",
  "Summarize my latest document",
  "What's worth the most points?",
];

export function TutorChat({
  fixedClassId,
  conversation,
  compact = false,
  className,
}: {
  fixedClassId?: string | undefined;
  conversation?: ConversationRow | undefined;
  compact?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const { data: classes = [] } = useClasses(user?.id);
  const queryClient = useQueryClient();
  const send = useServerFn(tutorChat);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pickedClassId, setClassId] = useClassPicker("all");
  const classId = fixedClassId ?? pickedClassId;
  const [mode, setMode] = useState<string>("explain");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversation) return;
    setConversationId(conversation.id);
    setMessages(((conversation.messages as ChatMsg[] | null) ?? []).map((m) => ({ role: m.role, content: m.content })));
    setMode(conversation.study_mode ?? "explain");
    if (conversation.class_id) setClassId(conversation.class_id);
  }, [conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === (fixedClassId ?? classId)),
    [classes, classId, fixedClassId],
  );

  async function submit(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setBusy(true);
    try {
      const targetClass = fixedClassId ?? (classId === "all" ? null : classId);
      void recordStudyActivity("tutor");
      const result = await send({
        data: { message, mode, classId: targetClass, conversationId },
      });
      if (result.error || !result.reply) {
        const messageText = result.error ?? "The tutor returned an empty response.";
        toast.error(messageText);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `I couldn't answer that: ${messageText}` },
        ]);
        return;
      }
      setConversationId(result.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The tutor could not answer right now.";
      toast.error(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `I hit an error answering that: ${msg}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDY_MODES.map((m) => (
              <SelectItem key={m.key} value={m.key} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!fixedClassId ? (
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-9 w-[170px] text-xs">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All classes
              </SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {classLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          {STUDY_MODES.find((m) => m.key === mode)?.hint}
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 scroll-slim">
        {messages.length === 0 ? (
          <div className="animate-fade-up rounded-xl border border-dashed border-border bg-card/60 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              Ask me anything about {activeClass ? classLabel(activeClass) : "your courses"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              I answer from your own uploaded syllabi and notes — and I'll tell you when something isn't in them.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-ring hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3 animate-fade-in", m.role === "user" && "justify-end")}>
            {m.role === "assistant" ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Bot className="size-4" />
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-card-foreground",
              )}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              ) : (
                <Markdown content={m.content} />
              )}
            </div>
            {m.role === "user" ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <User className="size-4" />
              </span>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading your materials…
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border pt-3"
      >
        <Textarea
          data-tour="tutor-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Ask your tutor…"
          rows={compact ? 2 : 2}
          className="max-h-32 min-h-[44px] resize-none"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
