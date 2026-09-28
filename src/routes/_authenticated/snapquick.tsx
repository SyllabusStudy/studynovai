import { MoreOptions } from "@/components/MoreOptions";
import { cn } from "@/lib/utils";
import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useClassPicker } from "@/lib/active-class";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImageUp, Loader2, Plus, Send, Sigma } from "lucide-react";
import { toast } from "sonner";
import { snapTutor } from "@/lib/ai.functions";
type SnapMode = "learn" | "quick" | "tutor" | "practice" | "check" | "method";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MathAnswer } from "@/components/MathAnswer";
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
  const [messages, setMessages] = useState<Msg[]>([]);
  const run = useServerFn(snapTutor);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string, opts?: { mode?: SnapMode; img?: string | null; fresh?: boolean }) {
    const msgText = text.trim();
    if (!msgText || busy) return;
    const history = opts?.fresh ? [] : messages;
    const img = opts?.img !== undefined ? opts.img : image;
    const userMsg: Msg = { role: "user", content: msgText, image: history.length ? null : img };
    setMessages([...history, userMsg]);
    setInput("");
    setBusy(true);
    try {
      if (!history.length) void recordStudyActivity("snapquick");
      const result = await run({
        data: {
          imageDataUrl: img,
          classId: classId === "all" ? null : classId,
          mode: opts?.mode ?? mode,
          history: history.map(({ role, content }) => ({ role, content })),
          message: msgText,
        },
      });
      if (result.error || !result.reply) {
        toast.error(result.error ?? "SnapQuick could not answer");
        setMessages(history);
        setInput(msgText);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: result.reply! }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SnapQuick could not answer");
      setMessages(history);
    } finally {
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
    setMessages([]);
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
                  <MathAnswer content={m.content} />
                </div>
              ),
            )}

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                {messages.length <= 1 ? "Reading the problem and working it out…" : "Thinking…"}
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {started && !busy ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FOLLOW_UPS.map((f) => (
                <Button key={f.label} size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void send(f.text, { mode: f.mode })}>
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
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
