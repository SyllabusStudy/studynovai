import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBilling } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const CLIENT = "ca-pub-7682709846932870";
const SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

function loadScript() {
  if (document.querySelector(`script[src^="https://pagead2.googlesyndication.com"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = SCRIPT_SRC;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

/** Google AdSense slot shown only to Free-plan students. Pro never loads ads. */
export function AdBanner({ slot, className, variant = "banner" }: { slot?: string; className?: string; variant?: "banner" | "sidebar" }) {
  const { user } = useAuth();
  const load = useServerFn(getBilling);
  const { data } = useQuery({ queryKey: ["billing", user?.id], enabled: !!user, queryFn: () => load({}) });
  const ref = useRef<HTMLModElement>(null);
  const free = !!data && data.plan !== "pro";

  useEffect(() => {
    if (!free || !ref.current || ref.current.dataset["adsbygoogleStatus"]) return;
    try {
      loadScript();
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* ad blockers or slow loads must never break the page */
    }
  }, [free]);

  if (!free) return null;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card/60 p-2", className)}>
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sponsored</p>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: "block", minHeight: variant === "sidebar" ? 200 : 90 }}
        data-ad-client={CLIENT}
        {...(slot ? { "data-ad-slot": slot } : {})}
        data-ad-format={variant === "sidebar" ? "rectangle" : "horizontal"}
        data-full-width-responsive="true"
      />
    </div>
  );
}
