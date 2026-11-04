/**
 * App-wide colour themes (the Theme Store).
 *
 * "classic" follows the Light / Dark / System preference (Classic Light and
 * Midnight Dark). Every other theme has a fixed colour scheme and needs the
 * `profile_themes` entitlement, which the database checks in set_app_theme()
 * and my_app_theme(). The tokens themselves live in globals.css under
 * :root[data-theme="<id>"].
 */
export const APP_THEME_IDS = [
  "classic",
  "premium-gold",
  "royal-purple",
  "ocean-blue",
  "rose-burgundy",
  "sunset-orange",
  "emerald-green",
  "neon-cyber",
  "minimal-white",
] as const;
export type AppThemeId = (typeof APP_THEME_IDS)[number];

export type ThemeCard = {
  /** Card id in the gallery. Classic Light and Midnight Dark share the "classic" app theme. */
  key: string;
  theme: AppThemeId;
  /** For classic cards: the mode the card selects. */
  mode?: "light" | "dark";
  name: string;
  description: string;
  premium: boolean;
  scheme: "light" | "dark";
  /** bg, surface, brand, accent, ink — for the preview swatch. */
  palette: [string, string, string, string, string];
};

export const THEME_CARDS: ThemeCard[] = [
  { key: "classic-light", theme: "classic", mode: "light", name: "Classic Light", description: "Clean white with a bright yellow accent.", premium: false, scheme: "light", palette: ["#FFFFFF", "#F7F7F8", "#FFFC00", "#8B5CF6", "#171717"] },
  { key: "midnight-dark", theme: "classic", mode: "dark", name: "Midnight Dark", description: "Deep charcoal that is easy on the eyes at night.", premium: false, scheme: "dark", palette: ["#101010", "#222222", "#FFFC00", "#A78BFA", "#FFFFFF"] },
  { key: "premium-gold", theme: "premium-gold", name: "Premium Gold", description: "Warm black with polished gold details.", premium: true, scheme: "dark", palette: ["#0F0D08", "#1B1710", "#D4AF37", "#F5D06F", "#FBF5E6"] },
  { key: "royal-purple", theme: "royal-purple", name: "Royal Purple", description: "Rich violet surfaces with lavender highlights.", premium: true, scheme: "dark", palette: ["#120C1F", "#1C1430", "#A78BFA", "#F0ABFC", "#F5F0FF"] },
  { key: "ocean-blue", theme: "ocean-blue", name: "Ocean Blue", description: "Airy sky blues and deep navy text.", premium: true, scheme: "light", palette: ["#F4F9FD", "#FFFFFF", "#38BDF8", "#0EA5E9", "#0B2540"] },
  { key: "rose-burgundy", theme: "rose-burgundy", name: "Rose Burgundy", description: "Dark wine tones with soft rose accents.", premium: true, scheme: "dark", palette: ["#1A0B10", "#261218", "#FB7185", "#FDA4AF", "#FFF0F3"] },
  { key: "sunset-orange", theme: "sunset-orange", name: "Sunset Orange", description: "The warm orange Quick Chat look.", premium: true, scheme: "light", palette: ["#FFF8F0", "#FFFFFF", "#FF9F43", "#F47B20", "#242424"] },
  { key: "emerald-green", theme: "emerald-green", name: "Emerald Green", description: "Fresh mint surfaces and emerald accents.", premium: true, scheme: "light", palette: ["#F3FBF6", "#FFFFFF", "#34D399", "#10B981", "#0B2618"] },
  { key: "neon-cyber", theme: "neon-cyber", name: "Neon Cyber", description: "Near-black with electric cyan and magenta.", premium: true, scheme: "dark", palette: ["#07070F", "#10101F", "#22D3EE", "#E879F9", "#EEF7FF"] },
  { key: "minimal-white", theme: "minimal-white", name: "Minimal White", description: "Monochrome and distraction-free.", premium: true, scheme: "light", palette: ["#FFFFFF", "#FAFAFA", "#111111", "#444444", "#111111"] },
];

/** Fixed colour scheme for each premium theme (classic follows the mode). */
export const THEME_SCHEME: Record<Exclude<AppThemeId, "classic">, "light" | "dark"> = Object.fromEntries(
  THEME_CARDS.filter((c) => c.theme !== "classic").map((c) => [c.theme, c.scheme]),
) as Record<Exclude<AppThemeId, "classic">, "light" | "dark">;

export function isAppThemeId(v: unknown): v is AppThemeId {
  return typeof v === "string" && (APP_THEME_IDS as readonly string[]).includes(v);
}
