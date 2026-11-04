/**
 * Quick Chat Premium — plan and feature copy shared by the client and server.
 * Prices are display copy only; the amount charged always comes from the
 * subscription_plans table on the server.
 */
export type PlanId = "monthly" | "yearly" | "lifetime";
export type Entitlement = "premium_badge" | "profile_themes" | "profile_analytics" | "extended_uploads" | "premium_video_effects";

export const PLANS: { id: PlanId; name: string; price: string; amountPaise: number; cadence: string; terms: string; highlight?: string }[] = [
  {
    id: "monthly",
    name: "Monthly",
    price: "₹49",
    amountPaise: 4900,
    cadence: "per month",
    terms: "Recurring. Renews automatically every month until you cancel; cancelling keeps Premium until the end of the paid month.",
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "₹299",
    amountPaise: 29900,
    cadence: "per year",
    terms: "Recurring. Renews automatically every year until you cancel; cancelling keeps Premium until the end of the paid year.",
    highlight: "Best value",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "₹1,999",
    amountPaise: 199900,
    cadence: "one-time payment",
    terms: "Pay once. No subscription and no renewals.",
  },
];

/** Only features that are actually implemented are listed. */
export const PREMIUM_FEATURES: { key: Entitlement; title: string; description: string }[] = [
  { key: "premium_badge", title: "Premium badge", description: "An exclusive badge next to your name on your profile." },
  { key: "profile_themes", title: "Premium themes", description: "Eight exclusive app themes in the Theme Store, plus five colour themes for your profile header." },
  { key: "profile_analytics", title: "Profile analytics", description: "Daily profile views and unique visitors for the last 30 days." },
  { key: "extended_uploads", title: "Bigger uploads", description: "Photos up to 30 MB, voice notes up to 40 MB, documents up to 50 MB, and 5 GB of uploads a day (free: 15 MB, 20 MB, 25 MB, 1 GB)." },
  { key: "premium_video_effects", title: "Premium call effects", description: "Extra video-call effects such as virtual backgrounds." },
];

export const PROFILE_THEMES = ["default", "sunset", "ocean", "forest", "midnight", "rose"] as const;
export type ProfileTheme = (typeof PROFILE_THEMES)[number];

/** Header gradient per profile theme. */
export const THEME_GRADIENTS: Record<ProfileTheme, string> = {
  default: "linear-gradient(135deg, #FF9F43, #FFB76B)",
  sunset: "linear-gradient(135deg, #F47B20, #FF5E7E)",
  ocean: "linear-gradient(135deg, #0EA5E9, #2563EB)",
  forest: "linear-gradient(135deg, #16A34A, #65A30D)",
  midnight: "linear-gradient(135deg, #1E1B4B, #4338CA)",
  rose: "linear-gradient(135deg, #E11D48, #F472B6)",
};

export function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
