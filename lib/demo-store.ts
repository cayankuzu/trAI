import { savedLooks } from "@/lib/mock-data";
import type { LookItem, ProfileData, TryOnResult } from "@/lib/types";

const LOOKS_STORAGE_KEY = "trai-demo-looks-v1";
const PROFILE_STORAGE_KEY = "trai-demo-profile-v1";

export const defaultProfile: ProfileData = {
  fullName: "Jane Doe",
  gender: "female",
  heightCm: 168,
  weightKg: null,
  chestCm: 88,
  waistCm: 68,
  hipCm: 94,
  usualTopSize: "M",
  usualBottomSize: "38",
  bottomSizeSystem: "EU",
};

export function getDemoLooks(): LookItem[] {
  if (typeof window === "undefined") {
    return savedLooks;
  }

  try {
    const stored = window.localStorage.getItem(LOOKS_STORAGE_KEY);
    if (!stored) return savedLooks;
    const parsed = JSON.parse(stored) as LookItem[];
    return Array.isArray(parsed) ? parsed : savedLooks;
  } catch {
    return savedLooks;
  }
}

export function saveDemoLook(result: TryOnResult) {
  const nextLook: LookItem = {
    id: `demo-${result.id}`,
    title: "Sanal prova",
    meta: "Az önce kaydedildi",
    label: "AI görsel prova",
    image: result.imageUrl,
    productUrl: result.productUrl,
  };
  const nextLooks = [nextLook, ...getDemoLooks().filter((look) => look.id !== nextLook.id)];
  window.localStorage.setItem(LOOKS_STORAGE_KEY, JSON.stringify(nextLooks));
  return nextLook;
}

export function removeDemoLook(id: string) {
  const nextLooks = getDemoLooks().filter((look) => look.id !== id);
  window.localStorage.setItem(LOOKS_STORAGE_KEY, JSON.stringify(nextLooks));
  return nextLooks;
}

export function clearDemoData() {
  window.localStorage.removeItem(LOOKS_STORAGE_KEY);
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export function getDemoProfile(): ProfileData {
  if (typeof window === "undefined") return defaultProfile;
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return stored ? { ...defaultProfile, ...(JSON.parse(stored) as Partial<ProfileData>) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

export function saveDemoProfile(profile: ProfileData) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
