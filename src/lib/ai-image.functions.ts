import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadUserAiKey } from "./ai-key.server";

/**
 * Generates or edits an image with the student's own AI key, so image work
 * never draws on the workspace's shared AI credits.
 */
export const generateAiImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(2).max(2000),
        imageDataUrl: z
          .string()
          .startsWith("data:image/")
          .max(12_000_000)
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ image: string }> => {
    const stored = await loadUserAiKey(context.supabase, context.userId);
    // Trust the key's own shape over whatever provider was picked in the dropdown.
    const cfg = { ...stored, provider: detectProvider(stored.key) ?? stored.provider };
    const { prompt } = data;
    const source = data.imageDataUrl ?? null;

    if (cfg.provider === "google") {
      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      if (source) {
        const [meta, b64] = source.split(",");
        parts.push({
          inline_data: {
            mime_type: meta?.slice(5).replace(";base64", "") || "image/png",
            data: b64 ?? "",
          },
        });
      }
      const imageModels = [
        "gemini-2.5-flash-image",
        "gemini-3-pro-image-preview",
        "gemini-2.0-flash-preview-image-generation",
      ];
      let res: Response | null = null;
      for (const model of imageModels) {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.key },
            body: JSON.stringify({ contents: [{ parts }] }),
          },
        );
        if (res.ok || (res.status !== 404 && res.status !== 400)) break;
      }
      if (!res || !res.ok) throw new Error(await imageError(res!));
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
        }>;
      };
      const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error("The image service returned no image. Try again.");
      return { image: `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}` };
    }

    if (cfg.provider === "openrouter") {
      const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
      if (source) content.push({ type: "image_url", image_url: { url: source } });
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) throw new Error(await imageError(res));
      const json = (await res.json()) as {
        choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
      };
      const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error("The image service returned no image. Try again.");
      return { image: url };
    }

    if (cfg.provider !== "openai") {
      throw new Error(
        "Image tools need a Google AI Studio, OpenRouter or OpenAI key. Switch your key in Settings → AI key.",
      );
    }

    // OpenAI: gpt-image-1 (generation only through this JSON endpoint).
    if (source) {
      throw new Error(
        "Editing an uploaded image needs a Google AI Studio key. Switch your key in Settings → AI key.",
      );
    }
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024" }),
    });
    if (!res.ok) throw new Error(await imageError(res));
    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = json.data?.[0];
    const image = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
    if (!image) throw new Error("The image service returned no image. Try again.");
    return { image };
  });

async function imageError(res: Response): Promise<string> {
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    return "Your AI API key was rejected. Check it in Settings → AI key.";
  }
  if (res.status === 402) return "Your AI provider account is out of credit.";
  if (res.status === 429 || res.status >= 500) {
    return "The image service is busy right now. Try again in a moment.";
  }
  return `The image could not be created (${res.status}): ${body.slice(0, 200)}`;
}
