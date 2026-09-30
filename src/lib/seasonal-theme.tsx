import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/data";

export type SeasonalThemeId =
  | "default"
  | "halloween"
  | "christmas"
  | "fall"
  | "winter"
  | "spring"
  | "summer"
  | "back-to-school"
  | "valentines";

type ThemeConfig = {
  id: SeasonalThemeId;
  label: string;
  emoji: string;
  /** Decoration glyphs, cycled across positions. */
  glyphs: string[];
  /** Soft ambient tint drawn behind the page, using theme-safe color-mix. */
  tint: string;
};

export const SEASONAL_THEMES: ThemeConfig[] = [
  { id: "default", label: "Default SyllabusStudy", emoji: "🌌", glyphs: [], tint: "transparent" },
  {
    id: "halloween",
    label: "Halloween",
    emoji: "🎃",
    glyphs: ["🎃", "🦇", "👻", "🕸️", "🧙", "🕷️", "🍬"],
    tint: "oklch(0.72 0.17 60 / 0.10)",
  },
  {
    id: "christmas",
    label: "Christmas",
    emoji: "🎄",
    glyphs: ["🎄", "🎅", "❄️", "🎁", "🔔", "✨", "🧑‍🎄"],
    tint: "oklch(0.62 0.16 145 / 0.10)",
  },
  {
    id: "fall",
    label: "Fall",
    emoji: "🍂",
    glyphs: ["🍂", "🍁", "🌰", "🎃", "🍄", "☕"],
    tint: "oklch(0.70 0.14 62 / 0.10)",
  },
  {
    id: "winter",
    label: "Winter",
    emoji: "❄️",
    glyphs: ["❄️", "⛄", "🌨️", "🧣", "🧊"],
    tint: "oklch(0.75 0.08 240 / 0.10)",
  },
  {
    id: "spring",
    label: "Spring",
    emoji: "🌸",
    glyphs: ["🌸", "🦋", "🌷", "🌼", "🍃", "🐝"],
    tint: "oklch(0.78 0.10 350 / 0.09)",
  },
  {
    id: "summer",
    label: "Summer",
    emoji: "☀️",
    glyphs: ["☀️", "☁️", "🌴", "🕶️", "🍉", "🏖️"],
    tint: "oklch(0.82 0.13 90 / 0.10)",
  },
  {
    id: "back-to-school",
    label: "Back to School",
    emoji: "📚",
    glyphs: ["📚", "✏️", "📒", "🗒️", "🎒", "📐"],
    tint: "oklch(0.68 0.11 255 / 0.09)",
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    emoji: "💕",
    glyphs: ["💕", "💗", "🌹", "💘", "✨", "🧸"],
    tint: "oklch(0.75 0.13 10 / 0.10)",
  },
];

export function themeConfig(id: string | null | undefined): ThemeConfig {
  return SEASONAL_THEMES.find((t) => t.id === id) ?? SEASONAL_THEMES[0]!;
}

const STORAGE_KEY = "studynova-seasonal-theme";
const EVENT = "studynova-seasonal-theme-change";

function readLocal(): SeasonalThemeId {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (themeConfig(stored).id);
}

/**
 * Reads the student's chosen seasonal theme. Instant locally, synced to the
 * account so the same theme follows them across devices.
 */
export function useSeasonalTheme() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const [theme, setThemeState] = useState<SeasonalThemeId>("default");

  useEffect(() => {
    setThemeState(readLocal());
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<SeasonalThemeId>).detail;
      if (next) setThemeState(next);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const remote = (profile as { seasonal_theme?: string } | undefined)?.seasonal_theme;
  useEffect(() => {
    if (!remote) return;
    const id = themeConfig(remote).id;
    setThemeState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, [remote]);

  const setTheme = useCallback(
    (next: SeasonalThemeId) => {
      setThemeState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
      if (user) {
        void supabase.from("profiles").update({ seasonal_theme: next }).eq("id", user.id);
      }
    },
    [user],
  );

  return { theme, setTheme };
}
