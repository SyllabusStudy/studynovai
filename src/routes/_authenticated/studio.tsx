import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { generateAiImage } from "@/lib/ai-image.functions";
import { AiKeySetupBanner, useAiKeyRedirect } from "@/lib/ai-key-gate";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "AI Image Studio — SyllabusStudy" },
      {
        name: "description",
        content:
          "Generate study diagrams and visuals, or edit a photo of your notes, with SyllabusStudy's image studio.",
      },
      { property: "og:title", content: "AI Image Studio — SyllabusStudy" },
      {
        property: "og:description",
        content: "Create study diagrams or edit your own images with AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

const IDEAS = [
  "A labeled diagram of the cell cycle for a biology exam",
  "A clean timeline poster of the US Civil War with 6 key dates",
  "A simple flowchart explaining how a for-loop works",
  "A colorful mind map of supply and demand for econ notes",
];

function StudioPage() {
  const makeImage = useServerFn(generateAiImage);
  const redirectForKey = useAiKeyRedirect();
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


  async function pick(file: File | undefined) {
    if (!file) return;
    const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
    if (!file.type.startsWith("image/") && !isPdf) {
      toast.error("Pick an image (PNG or JPG) or a PDF.");
      return;
    }
    if (file.size > 12_000_000) {
      toast.error("That file is too large — keep it under 12MB.");
      return;
    }
    if (isPdf) {
      setLoadingSource(true);
      try {
        const { renderPdfPages } = await import("@/lib/pdf-render");
        const pages = await renderPdfPages(file, 1);
        if (!pages.length) throw new Error("empty");
        setSource(pages[0]!.dataUrl);
        toast.success("Using page 1 of that PDF");
      } catch {
        toast.error("Could not read that PDF.");
      } finally {
        setLoadingSource(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result));
    reader.readAsDataURL(file);
  }


  async function run() {
    if (prompt.trim().length < 2) {
      toast.error("Describe what you want first.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { image } = await makeImage({ data: { prompt, imageDataUrl: source } });
      setResult(image);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not make that image";
      if (!redirectForKey(msg)) toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Image Studio"
        description="Make a study diagram from a description, or upload an image or PDF page and tell the AI how to change it."
      />
      <AiKeySetupBanner />

      <Hint id="studio-intro" point="down" className="mb-4">
        Describe a diagram to create one from scratch — or upload a photo or PDF first and the AI works
        from that page instead.
      </Hint>


      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="studio-prompt">What should the image show?</Label>
            <Textarea
              id="studio-prompt"
              rows={4}
              placeholder={source ? "e.g. label each part and make the text easier to read" : IDEAS[0]}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {idea.split(" ").slice(0, 5).join(" ")}…
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Optional: work from your own image or PDF</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            {source ? (
              <div className="relative w-fit">
                <img src={source} alt="File to edit" className="max-h-40 rounded-lg border border-border" />
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute -right-2 -top-2 size-7"
                  aria-label="Remove uploaded file"
                  onClick={() => setSource(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={loadingSource}
                onClick={() => fileRef.current?.click()}
              >
                {loadingSource ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload an image or PDF
              </Button>
            )}
          </div>

          <Button onClick={() => void run()} disabled={busy || loadingSource} className="w-full gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {source ? "Edit this image" : "Generate image"}

          </Button>
        </div>

        <div className="surface-card flex min-h-64 items-center justify-center p-4">
          {busy ? (
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-6 animate-spin text-primary" />
              Drawing it now — this takes a few seconds.
            </div>
          ) : result ? (
            <div className="w-full space-y-3">
              <img src={result} alt={prompt} className="w-full rounded-lg border border-border" />
              <Button asChild variant="secondary" size="sm" className="gap-1.5">
                <a href={result} download="studymate-image.png">
                  <Download className="size-4" /> Download
                </a>
              </Button>
            </div>
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              <ImagePlus className="mx-auto mb-2 size-6 text-primary" />
              Your image shows up here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
