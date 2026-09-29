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
    const opener = window.opener as Window | null;

    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      if (!opener) {
        setMessage(
          type === "appUserConnectorOAuthComplete"
            ? "You're signed in. You can close this window and return to StudyNova."
            : "That didn't finish. You can close this window and try again.",
        );
        return;
      }
      // The opener page runs on this same origin, so a targeted post is safe
      // and the opener can verify where it came from.
      opener.postMessage(
        { type, connectorId: "google_mail", code: code ?? null },
        window.location.origin,
      );
      // Give the browser a beat to deliver the message before this window goes
      // away — closing in the same tick can drop it.
      window.setTimeout(() => window.close(), 400);
    };

    if (params.get("success") !== "true") {
      const reason = params.get("error");
      setMessage(
        reason === "access_denied"
          ? "Google didn't allow that sign-in. You can close this window and try again."
          : "That didn't finish. You can close this window and try again.",
      );
      notify("appUserConnectorOAuthFailed");
      return;
    }

    const connector = params.get("connector_id");
    if (connector && connector !== "google_mail") {
      setMessage("That sign-in didn't match your inbox. You can close this window.");
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
    setMessage("All set — bringing you back to StudyNova…");
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}
