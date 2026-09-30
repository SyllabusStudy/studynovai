import { useMemo } from "react";
import { themeConfig, useSeasonalTheme, type SeasonalThemeId } from "@/lib/seasonal-theme";
import { useIsMobile } from "@/hooks/use-mobile";

type Spot = { left: number; top: number; size: number; delay: number; duration: number; drift: string };

/** Deterministic spread so decorations never jump around between renders. */
function buildSpots(count: number): Spot[] {
  const spots: Spot[] = [];
  for (let i = 0; i < count; i += 1) {
    const golden = (i * 0.6180339887) % 1;
    spots.push({
      left: Math.round(golden * 92) + 2,
      top: Math.round(((i * 37) % 90) + 3),
      size: 16 + ((i * 7) % 16),
      delay: (i % 8) * 0.9,
      duration: 9 + ((i * 3) % 8),
      drift: i % 3 === 0 ? "seasonal-sway" : i % 3 === 1 ? "seasonal-float" : "seasonal-drift",
    });
  }
  return spots;
}

export function SeasonalDecorations({ override }: { override?: SeasonalThemeId }) {
  const { theme } = useSeasonalTheme();
  const isMobile = useIsMobile();
  const config = themeConfig(override ?? theme);
  const count = isMobile ? 8 : 18;
  const spots = useMemo(() => buildSpots(count), [count]);

  if (config.glyphs.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none">
      <div className="absolute inset-0" style={{ background: config.tint }} />
      {spots.map((spot, i) => (
        <span
          key={i}
          className="absolute opacity-35 dark:opacity-30"
          style={{
            left: `${spot.left}%`,
            top: `${spot.top}%`,
            fontSize: `${isMobile ? spot.size * 0.7 : spot.size}px`,
            lineHeight: 1,
            animation: `${spot.drift} ${spot.duration}s ease-in-out ${spot.delay}s infinite`,
          }}
        >
          {config.glyphs[i % config.glyphs.length]}
        </span>
      ))}
    </div>
  );
}
