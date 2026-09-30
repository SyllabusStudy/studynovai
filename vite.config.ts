// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        outDir: "dist/client",
        devOptions: { enabled: false },
        includeAssets: ["favicon.png", "apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "SyllabusStudy",
          short_name: "SyllabusStudy",
          description: "Your semester, made simple. Classes, deadlines, flashcards, quizzes and an AI tutor in one app.",
          start_url: "/dashboard?source=pwa",
          categories: ["education", "productivity"],
          lang: "en",
          scope: "/",
          display: "standalone",
          orientation: "any",
          theme_color: "#0F1117",
          background_color: "#0F1117",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          shortcuts: [
            { name: "My Classes", url: "/classes", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
            { name: "Calendar", url: "/calendar", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
            { name: "SnapQuick", url: "/snapquick", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
            { name: "AI Tutor", url: "/tutor", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
          ],
        },
        workbox: {
          // adds the background push + notification click handlers to the generated worker
          importScripts: ["/push-sw.js"],
          globDirectory: "dist/client",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/sitemap\.xml$/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "studymate-html",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\//.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "studymate-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
