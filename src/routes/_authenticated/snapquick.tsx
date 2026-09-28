import { MoreOptions } from "@/components/MoreOptions";
import { cn } from "@/lib/utils";
import { recordStudyActivity } from "@/lib/activity";
import { createFileRoute } from "@tanstack/react-router";
import { ClassActionBar } from "@/components/ClassActionBar";
import { useClassPicker } from "@/lib/active-class";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImageUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { snapHelp } from "@/lib/ai.functions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
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

function SnapQuickPage() {
  const { user } = useAuth();
  const { data: classes = [] } = useClasses(user?.id);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [classId, setClassId] = useClassPicker("all");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const run = useServerFn(snapHelp);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const url = await toDataUrl(file);
      setImage(url);
      setAnswer(null);
      void scan(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that photo");
    }
  }

  async function scan(dataUrl: string, followUp?: string) {
    setBusy(true);
    try {
      void recordStudyActivity("snapquick");
      const result = await run({
        data: {
          imageDataUrl: dataUrl,
          classId: classId === "all" ? null : classId,
          question:
            [question, followUp ?? "Format the reply with headings: Detected questions, Step-by-step explanation, Final answer."]
              .filter(Boolean)
              .join("\n") || null,
        },
      });
      setAnswer(result.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SnapQuick could not scan that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Stuck on a problem?" description="Snap your homework. Get step-by-step help." />
      <ClassActionBar />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => (image ? galleryRef.current?.click() : cameraRef.current?.click())}
            className="surface-card block w-full overflow-hidden text-left transition-colors hover:border-primary/60"
            aria-label={image ? "Choose a different photo" : "Take a picture of your homework"}
          >
            {image ? (
              <img src={image} alt="Photo of your work being scanned" className="max-h-80 w-full object-contain" />
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary/10 to-transparent p-6 text-center">
                <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
                  <Camera className="size-8" />
                </span>
                <p className="font-display text-lg font-bold">Tap to snap your work</p>
                <p className="text-xs text-muted-foreground">One photo · every question explained</p>
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

          <MoreOptions summary={classId === "all" ? "All classes" : classes.find((c) => c.id === classId)?.class_name}>
            <div className="space-y-2">
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
              <Input
                placeholder="What are you stuck on? (optional)"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              {image ? (
                <Button variant="secondary" className="w-full gap-1.5" disabled={busy} onClick={() => void scan(image)}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  Scan again
                </Button>
              ) : null}
            </div>
          </MoreOptions>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files)} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files)} />
        </div>

        <div className={cn("surface-card min-h-48 p-4 sm:p-6", !busy && !answer && "hidden lg:block")}>
          {busy ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-semibold">Reading your photo…</p>
              <p className="text-xs text-muted-foreground">Finding each question and working it out</p>
            </div>
          ) : answer ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Sparkles className="size-4" /> Your walkthrough
              </div>
              <Markdown content={answer} />
              {image ? (
                <div className="grid gap-2 border-t border-border pt-4 sm:flex sm:flex-wrap">
                  <Button variant="outline" onClick={() => void scan(image, "Explain this differently, using a simpler approach and an everyday analogy.")}>
                    Explain This Differently
                  </Button>
                  <Button variant="outline" onClick={() => void scan(image, "Give me one similar practice problem with different numbers, then its worked solution hidden under a 'Solution' heading.")}>
                    Give Me a Similar Problem
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="size-6" />
              </span>
              <p className="font-display text-base font-bold">Your walkthrough shows up here</p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li>1. Snap or upload a photo</li>
                <li>2. We find every question</li>
                <li>3. You get steps + the answer</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
