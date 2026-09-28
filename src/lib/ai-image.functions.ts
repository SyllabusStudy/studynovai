import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectProvider, loadUserAiKey } from "./ai-key.server";
import { fetchAiWithRetry } from "./ai-request.server";

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
    // Trust provider-specific key formats over an accidentally selected dropdown value.
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
      // One free-tier image model, one request — no paid fallback chain.
      const res = await fetchAiWithRetry(
        "google-image",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.key },
          body: JSON.stringify({ contents: [{ parts }] }),
        },
      );
      if (!res.ok) throw new Error(await imageError(res));

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
      const res = await fetchAiWithRetry("openrouter-image", "https://openrouter.ai/api/v1/chat/completions", {
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
    const res = await fetchAiWithRetry("openai-image", "https://api.openai.com/v1/images/generations", {
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
  let detail = body.slice(0, 240);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    detail = parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    // Keep the bounded provider response when it is not JSON.
  }
  if (res.status === 401 || res.status === 403) {
    return `Your AI provider did not authorize this request: ${detail || "check the key and its API permissions."}`;
  }
  if (res.status === 402 || res.status === 429) {
    return "You've hit your provider's free AI limit for now. Try again later — nothing was charged.";
  }
  return `The image could not be created (${res.status}): ${detail}`;
}
