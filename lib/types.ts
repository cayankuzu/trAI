export type NavigationKey = "try-on" | "looks" | "profile";

export type Gender = "female" | "male" | "other";

export type TopSize = "XXS" | "XS" | "S" | "M" | "L" | "XL" | "XXL" | "3XL" | "4XL";
export type BottomSizeSystem = "EU" | "W";
export type TryOnView = "front" | "back";
export type FitIntent = "fitted" | "regular" | "relaxed";
export type FitConfidence = "high" | "medium" | "low";
export type TryOnRenderMode = "fit-aware" | "garment-fidelity";

export type NavigationItem = {
  key: NavigationKey;
  label: string;
  href: string;
  icon: string;
};

export type StatusTone = "error" | "warning" | "success" | "offline" | "empty";

export type StatusState = {
  slug: string;
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  tone: StatusTone;
  symbol: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  detailTitle: string;
  detailText: string;
  appScreen: boolean;
  active?: NavigationKey;
};

export type LookItem = {
  id: string;
  title: string;
  meta: string;
  label: string;
  image: string;
  productUrl?: string;
  createdAt?: string;
  group?: { id: string; name: string } | null;
  sessionId?: string | null;
  selectedSizes?: string[];
  recommendedSize?: string | null;
  variants?: TryOnResult[];
};

export type TryOnResult = {
  id: string;
  sessionId: string;
  imageUrl: string;
  productUrl: string;
  createdAt: string;
  size: string;
  view: TryOnView;
  fitIntent: FitIntent;
  fitScore: number | null;
  sizeRecommendation: string | null;
  renderMode?: TryOnRenderMode;
};

export type ProfileData = {
  fullName: string;
  gender: Gender;
  heightCm: number | null;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  usualTopSize: TopSize | null;
  usualBottomSize: string | null;
  bottomSizeSystem: BottomSizeSystem;
};
