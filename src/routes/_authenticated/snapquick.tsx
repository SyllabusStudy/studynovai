import { MoreOptions } from "@/components/MoreOptions";
import { cn } from "@/lib/utils";
import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useClassPicker } from "@/lib/active-class";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, History, ImageUp, Loader2, Plus, Send, Sigma, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { snapTutor } from "@/lib/ai.functions";
type SnapMode = "learn" | "quick" | "tutor" | "practice" | "check" | "method";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MathAnswer } from "@/components/MathAnswer";
import { AiRetryNotice } from "@/components/AiRetryNotice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classLabel, useClasses } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/snapquick")({
  head: () => ({
    meta: [
      { title: "SnapQuick — Snap your work, get help — StudyNova" },
      {
        name: "description",
        content:
          "Take a photo of your homework and SnapQuick scans it, identifies every question and walks you through the answers.",
      },
      { property: "og:title", content: "SnapQuick — StudyNova" },
      { property: "og:description", content: "Photograph your work and get instant, step-by-step AI help." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { open?: string } =>
    typeof s["open"] === "string" ? { open: s["open"] as string } : {},
  component: SnapQuickPage,
});

const MAX_EDGE = 1600;

async function toDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("bad image"));
      el.src = raw;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

type Msg = { role: "user" | "assistant"; content: string; image?: string | null };

const MODES: { id: SnapMode; label: string; hint: string }[] = [
  { id: "learn", label: "🧠 Learn", hint: "Full step-by-step lesson" },
  { id: "quick", label: "⚡ Quick answer", hint: "Key steps only" },
  { id: "tutor", label: "👩‍🏫 Tutor me", hint: "Hints, no spoilers" },
  { id: "check", label: "🔍 Check my work", hint: "Find my mistake" },
];

const FOLLOW_UPS: { label: string; mode: SnapMode; text: string }[] = [
  { label: "Explain it easier", mode: "learn", text: "Explain it easier, like I'm a beginner." },
  { label: "Show more steps", mode: "learn", text: "Show more steps — redo the solution with every small step written out." },
  { label: "Another method", mode: "method", text: "Show me another method for this problem." },
  { label: "Give me a hint", mode: "tutor", text: "Don't give me the answer yet — give me a hint for the next step." },
  { label: "Similar problem", mode: "practice", text: "Give me a similar problem to practice." },
  { label: "Quiz me", mode: "practice", text: "Quiz me on this with one short question." },
];

function SnapQuickPage() {
  const { user } = useAuth();
  const { data: classes = [] } = useClasses(user?.id);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [classId, setClassId] = useClassPicker("all");
  const [mode, setMode] = useState<SnapMode>("learn");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failed, setFailed] = useState<{
    request: { imageDataUrl: string | null; classId: string | null; mode: SnapMode; history: Array<{ role: "user" | "assistant"; content: string }>; message: string };
    history: Msg[]; userMsg: Msg; image: string | null; id: string | null;
  } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const run = useServerFn(snapTutor);
  const qc = useQueryClient();
  const [convId, setConvId] = useState<string | null>(null);
  const { data: saved = [] } = useQuery({
    queryKey: ["snap-conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("snap_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  async function saveConversation(all: Msg[], img: string | null, id: string | null, usedMode: SnapMode) {
    if (!user) return id;
    const first = all.find((m) => m.role === "user")?.content ?? "Untitled problem";
    const title = first.replace(/\s+/g, " ").slice(0, 80);
    const row = {
      user_id: user.id,
      title,
      mode: usedMode,
      class_id: classId === "all" ? null : classId,
      image_data_url: img,
      messages: all.map(({ role, content }) => ({ role, content })),
      updated_at: new Date().toISOString(),
    };
    const res = id
      ? await supabase.from("snap_conversations").update(row).eq("id", id).select("id").single()
      : await supabase.from("snap_conversations").insert(row).select("id").single();
    void qc.invalidateQueries({ queryKey: ["snap-conversations", user.id] });
    return res.data?.id ?? id;
  }

  async function openConversation(id: string) {
    if (busy) return;
    const { data, error } = await supabase.from("snap_conversations").select("*").eq("id", id).single();
    if (error || !data) {
      toast.error("Could not open that problem");
      return;
    }
    const msgs = (Array.isArray(data.messages) ? data.messages : []) as unknown as Msg[];
    if (msgs[0] && data.image_data_url) msgs[0] = { ...msgs[0], image: data.image_data_url };
    setMessages(msgs);
    setImage(data.image_data_url);
    setMode((data.mode as SnapMode) ?? "learn");
    setConvId(data.id);
    setRevealed(true);
  }

  async function deleteConversation(id: string) {
    await supabase.from("snap_conversations").delete().eq("id", id);
    if (id === convId) reset();
    void qc.invalidateQueries({ queryKey: ["snap-conversations", user?.id] });
  }

  const [revealed, setRevealed] = useState(false);
  const { open: openId } = Route.useSearch();
  useEffect(() => {
    if (openId && user?.id) void openConversation(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string, opts?: { mode?: SnapMode; img?: string | null; fresh?: boolean }) {
    const msgText = text.trim();
    if (!msgText || busyRef.current || (failed && !opts?.fresh)) return;
    const history = opts?.fresh ? [] : messages;
    const idForSave = opts?.fresh ? null : convId;
    if (opts?.fresh) setConvId(null);
    setRevealed(false);
    const img = opts?.img !== undefined ? opts.img : image;
    const userMsg: Msg = { role: "user", content: msgText, image: history.length ? null : img };
    setMessages([...history, userMsg]);
    setInput("");
    const pending = {
      request: {
        imageDataUrl: img,
        classId: classId === "all" ? null : classId,
        mode: opts?.mode ?? mode,
        history: history.map(({ role, content }) => ({ role, content })),
        message: msgText,
      },
      history, userMsg, image: img, id: idForSave,
    };
    await sendRequest(pending);
  }

  async function sendRequest(pending: {
    request: { imageDataUrl: string | null; classId: string | null; mode: SnapMode; history: Array<{ role: "user" | "assistant"; content: string }>; message: string };
    history: Msg[]; userMsg: Msg; image: string | null; id: string | null;
  }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setFailed(null);
    setBusy(true);
    try {
      if (!pending.history.length) void recordStudyActivity("snapquick");
      const result = await run({ data: pending.request });
      if (result.error || !result.reply) {
        setFailed(pending);
        return;
      }
      const all: Msg[] = [...pending.history, pending.userMsg, { role: "assistant", content: result.reply }];
      setMessages(all);
      try {
        const newId = await saveConversation(all, pending.image, pending.id, pending.request.mode);
        setConvId(newId);
      } catch {
        toast.error("The answer is ready, but this conversation could not be saved yet.");
      }
    } catch (e) {
      setFailed(pending);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      let url: string;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const { renderPdfPages } = await import("@/lib/pdf-render");
        const pages = await renderPdfPages(file, 1);
        const first = pages[0];
        if (!first) throw new Error("That PDF has no readable pages.");
        url = first.dataUrl;
      } else {
        url = await toDataUrl(file);
      }
      setImage(url);
      const prompt =
        mode === "check"
          ? "Here is my work. Check it and show me where I went wrong."
          : input.trim() || "Read the problem in this photo and teach me how to solve it.";
      void send(prompt, { img: url, fresh: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    }
  }

  function reset() {
    setFailed(null);
    setMessages([]);
    setConvId(null);
    setImage(null);
    setInput("");
  }

  const started = messages.length > 0;

  return (
    <div>
      <PageHeader title="Stuck on a problem?" description="Snap it or type it. Learn every step." />
      <ClassActionBar />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="surface-card block w-full overflow-hidden text-left transition-colors hover:border-primary/60"
            aria-label={image ? "Snap a new problem" : "Take a picture of your homework"}
          >
            {image ? (
              <img src={image} alt="Your problem" className="max-h-64 w-full object-contain" />
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary/10 to-transparent p-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
                  <Camera className="size-7" />
                </span>
                <p className="font-display text-lg font-bold">Tap to snap your work</p>
                <p className="text-xs text-muted-foreground">Or type the problem below</p>
              </div>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" className="gap-1.5" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" /> Camera
            </Button>
            <Button size="lg" variant="outline" className="gap-1.5" disabled={busy} onClick={() => galleryRef.current?.click()}>
              <ImageUp className="size-4" /> Upload
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  mode === m.id ? "border-primary bg-primary/12" : "border-border hover:border-primary/50",
                )}
              >
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>

          <MoreOptions summary={classId === "all" ? "All classes" : classes.find((c) => c.id === classId)?.class_name}>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Which class?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MoreOptions>

          {saved.length ? (
            <div className="surface-card p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <History className="size-3.5" /> Past problems
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {saved.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openConversation(c.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                        c.id === convId && "bg-primary/12 font-semibold",
                      )}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete this problem"
                      onClick={() => void deleteConversation(c.id)}
                      className="rounded-md p-1 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
          <input ref={galleryRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="surface-card flex min-h-[28rem] flex-col p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sigma className="size-4" /> SnapQuick tutor
            </div>
            {started ? (
              <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy} onClick={reset}>
                <Plus className="size-4" /> New problem
              </Button>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto">
            {!started && !busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Sigma className="size-6" />
                </span>
                <p className="font-display text-base font-bold">Your tutor walks you through it</p>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  <li>1. Snap a photo or type a problem</li>
                  <li>2. Learn the method, every step and why</li>
                  <li>3. Ask follow-ups — "I don't get step 2"</li>
                </ol>
              </div>
            ) : null}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                    {m.image ? <img src={m.image} alt="Problem photo" className="max-h-40 rounded-lg" /> : null}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="min-w-0">
                  <MathAnswer content={m.content} animate={!revealed && i === messages.length - 1} />
                </div>
              ),
            )}

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                {messages.length <= 1 ? "Reading the problem and working it out…" : "Thinking…"}
              </div>
            ) : null}
            {failed && !busy ? <AiRetryNotice message="I’m having trouble connecting right now. Your problem is saved here — try again in a moment." onRetry={() => void sendRequest(failed)} /> : null}
            <div ref={endRef} />
          </div>

          {started && !busy ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FOLLOW_UPS.map((f) => (
              <Button key={f.label} size="sm" variant="outline" disabled={!!failed} className="h-8 rounded-full text-xs" onClick={() => void send(f.text, { mode: f.mode })}>
                  {f.label}
                </Button>
              ))}
            </div>
          ) : null}

          <form
            className="mt-3 flex items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={started ? "Ask a follow-up… e.g. why did we divide by 2?" : "Type a problem, e.g. solve 2x² − 7x + 3 = 0"}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || !!failed || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
