import { createFileRoute } from "@tanstack/react-router";

type Body = { prompt?: string; imageDataUrl?: string | null };

/**
 * Generates a new image from a prompt, or edits an uploaded image when
 * `imageDataUrl` is present. Gemini image models take both on the same
 * generations endpoint, so one route covers "create" and "edit".
 */
export const Route = createFileRoute("/api/ai-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI is not configured for this project yet.", { status: 500 });

        const { prompt, imageDataUrl } = (await request.json()) as Body;
        if (!prompt || prompt.trim().length < 2) {
          return new Response("Describe the image you want first.", { status: 400 });
        }
        if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
          return new Response("That file is not an image.", { status: 400 });
        }

        const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt.slice(0, 2000) }];
        if (imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl } });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          const message =
            upstream.status === 429 || upstream.status >= 500
              ? "The image service is busy right now. Try again in a moment."
              : upstream.status === 402
                ? "AI credits are exhausted for this workspace."
                : `Image request failed (${upstream.status}): ${text.slice(0, 300)}`;
          return new Response(message, { status: upstream.status });
        }

        const json = (await upstream.json()) as {
          data?: Array<{ b64_json?: string; url?: string }>;
        };
        const first = json.data?.[0];
        const image = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
        if (!image) return new Response("The AI returned no image. Try rewording the prompt.", { status: 502 });

        return new Response(JSON.stringify({ image }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
