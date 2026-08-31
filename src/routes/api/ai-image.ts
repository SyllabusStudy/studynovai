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

        // Try several image models in order so a single model hiccup or policy
        // quirk never bubbles up as "reword your prompt".
        const models = imageDataUrl
          ? ["google/gemini-3-pro-image", "google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"]
          : [
              "google/gemini-3-pro-image",
              "google/gemini-3.1-flash-image",
              "google/gemini-2.5-flash-image",
              "openai/gpt-image-2",
            ];

        let lastStatus = 502;
        let lastText = "";

        for (const model of models) {
          const body =
            model.startsWith("openai/")
              ? { model, prompt: prompt.slice(0, 2000), size: "1024x1024" }
              : { model, messages: [{ role: "user", content }], modalities: ["image", "text"] };

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!upstream.ok) {
            lastStatus = upstream.status;
            lastText = await upstream.text();
            // Credits or auth problems will not improve with another model.
            if (upstream.status === 402 || upstream.status === 401 || upstream.status === 403) break;
            continue;
          }

          const json = (await upstream.json()) as {
            data?: Array<{ b64_json?: string; url?: string }>;
          };
          const first = json.data?.[0];
          const image = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
          if (image) {
            return new Response(JSON.stringify({ image }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          lastStatus = 502;
          lastText = "no image in response";
        }

        const message =
          lastStatus === 402
            ? "AI credits are exhausted for this workspace."
            : lastStatus === 429 || lastStatus >= 500
              ? "The image service is busy right now. Try again in a moment."
              : `The image could not be created right now. Please try again. (${lastStatus}) ${lastText.slice(0, 200)}`;
        return new Response(message, { status: lastStatus === 200 ? 502 : lastStatus });
      },
    },
  },
});

