import type { BottomSizeSystem, TopSize } from "@/lib/types";

export const TOP_SIZE_OPTIONS = [
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL",
] as const satisfies readonly TopSize[];

export const BOTTOM_SIZE_OPTIONS: Record<BottomSizeSystem, readonly string[]> = {
  EU: Array.from({ length: 29 }, (_, index) => String(index + 32)),
  W: Array.from({ length: 21 }, (_, index) => String(index + 24)),
};

export function isTopSize(value: string): value is TopSize {
  return TOP_SIZE_OPTIONS.includes(value as TopSize);
}

export function isBottomSizeForSystem(value: string, system: BottomSizeSystem) {
  return BOTTOM_SIZE_OPTIONS[system].includes(value);
}
