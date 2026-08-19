import { createFileRoute } from "@tanstack/react-router";
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
      { title: "SnapQuick — Snap your work, get help — StudyMate AI" },
      {
        name: "description",
        content:
          "Take a photo of your homework and SnapQuick scans it, identifies every question and walks you through the answers.",
      },
      { property: "og:title", content: "SnapQuick — StudyMate AI" },
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
  const [classId, setClassId] = useState("all");
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

  async function scan(dataUrl: string) {
    setBusy(true);
    try {
      const result = await run({
        data: {
          imageDataUrl: dataUrl,
          classId: classId === "all" ? null : classId,
          question: question || null,
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
      <PageHeader
        title="SnapQuick"
        description="Point your camera at any worksheet, problem set or whiteboard — StudyMate reads it and explains every question."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <div className="surface-card overflow-hidden">
            {image ? (
              <img src={image} alt="Photo of your work being scanned" className="w-full object-contain" />
            ) : (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 bg-secondary/40 p-6 text-center">
                <Camera className="size-8 text-primary" />
                <p className="text-sm font-semibold">Snap your work</p>
                <p className="text-xs text-muted-foreground">
                  Use your phone camera, or pick a screenshot from this device.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 gap-1.5" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" /> Take a picture
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageUp className="size-4" /> Upload image
            </Button>
          </div>

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
              placeholder="Optional: what are you stuck on?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            {image ? (
              <Button
                variant="secondary"
                className="w-full gap-1.5"
                disabled={busy}
                onClick={() => void scan(image)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Scan again
              </Button>
            ) : null}
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void pick(e.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files)}
          />
        </div>

        <div className="surface-card min-h-48 p-5">
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Reading your photo…
            </p>
          ) : answer ? (
            <Markdown content={answer} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <Sparkles className="size-6 text-primary" />
              <p className="text-sm font-semibold">Your walkthrough shows up here</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                SnapQuick identifies every problem in the photo, solves it step by step, and tells you what to
                review.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
