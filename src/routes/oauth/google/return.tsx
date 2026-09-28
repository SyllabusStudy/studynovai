import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google/return")({
  head: () => ({
    meta: [
      { title: "Finishing your email connection — StudyNova" },
      {
        name: "description",
        content: "StudyNova is finishing the secure connection to your email account.",
      },
      { property: "og:title", content: "Finishing your email connection — StudyNova" },
      { property: "og:description", content: "One moment while StudyNova connects your inbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing your email connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage("That didn't finish. You can close this window and try again.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("That didn't finish. You can close this window and try again.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}
