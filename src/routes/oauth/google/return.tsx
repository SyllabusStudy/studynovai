import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google/return")({
  head: () => ({
    meta: [
      { title: "Finishing your email connection — SyllableStudy" },
      {
        name: "description",
        content: "SyllableStudy is finishing the secure connection to your email account.",
      },
      { property: "og:title", content: "Finishing your email connection — SyllableStudy" },
      { property: "og:description", content: "One moment while SyllableStudy connects your inbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

/** Same-origin hand-back channel. Google's sign-in page can cut the link
 *  between this window and the SyllableStudy page that opened it, so the result is
 *  also left in shared browser storage for that page to pick up. */
const RELAY_KEY = "studynova.mailOAuthResult";
const RELAY_CHANNEL = "studynova-mail-oauth";

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing your email connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const handOff = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
      closeAfter = true,
    ) => {
      const payload = {
        type,
        connectorId: "google_mail",
        code: code ?? null,
        at: Date.now(),
      };

      try {
        window.localStorage.setItem(RELAY_KEY, JSON.stringify(payload));
      } catch {
        /* storage unavailable */
      }
      try {
        const channel = new BroadcastChannel(RELAY_CHANNEL);
        channel.postMessage(payload);
        channel.close();
      } catch {
        /* channel unsupported */
      }
      try {
        window.opener?.postMessage(payload, window.location.origin);
      } catch {
        /* opener link severed */
      }

      if (closeAfter) window.setTimeout(() => window.close(), 600);
    };

    if (params.get("success") !== "true") {
      const reason = params.get("error");
      setMessage(
        reason === "access_denied"
          ? "Google didn't allow that sign-in. You can close this window and try again."
          : "That didn't finish. You can close this window and try again.",
      );
      handOff("appUserConnectorOAuthFailed", undefined, false);
      return;
    }

    const connector = params.get("connector_id");
    if (connector && connector !== "google_mail") {
      setMessage("That sign-in didn't match your inbox. You can close this window.");
      handOff("appUserConnectorOAuthFailed", undefined, false);
      return;
    }

    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        handOff("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("That didn't finish. You can close this window and try again.");
      handOff("appUserConnectorOAuthFailed", undefined, false);
      return;
    }
    setMessage("All set — bringing you back to SyllableStudy…");
    handOff("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}
