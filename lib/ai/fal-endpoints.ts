export const FAL_FIT_AWARE_TRY_ON_ENDPOINT = "fal-ai/flux-2-lora-gallery/virtual-tryon" as const;
export const FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT = "fal-ai/fashn/tryon/v1.6" as const;
export const FAL_PRIMARY_TRY_ON_ENDPOINT = FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT;
export const FAL_LEGACY_TRY_ON_ENDPOINT = "fal-ai/flux-pro/v1/vto" as const;

// FASHN is the default because preserving the catalog garment's print, texture,
// and construction is more reliable than prompt-driven fit approximation. The
// FLUX 2 LoRA endpoint is reserved for an explicitly requested fit-aware render;
// neither endpoint is a physical sizing or cloth-simulation engine.
export const FAL_SAFETY_FALLBACK_TRY_ON_ENDPOINT = FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT;

export const FAL_TRY_ON_ENDPOINTS = [
  FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
  FAL_FIT_AWARE_TRY_ON_ENDPOINT,
  FAL_LEGACY_TRY_ON_ENDPOINT,
] as const;

export type FalTryOnEndpoint = (typeof FAL_TRY_ON_ENDPOINTS)[number];
export type FalProviderMode =
  | "primary"
  | "safety_fallback"
  | "garment_fidelity"
  | "fit_aware";
export type TryOnRenderMode = "fit-aware" | "garment-fidelity";
export type FashnGarmentCategory = "tops" | "bottoms" | "one-pieces";
export type FashnGarmentPhotoType = "auto" | "model" | "flat-lay";
export type CatalogCategoryKey = "tops" | "bottoms" | "one-piece";

export function falTryOnEndpointForMode(
  mode: FalProviderMode = "primary",
): FalTryOnEndpoint {
  return mode === "fit_aware"
    ? FAL_FIT_AWARE_TRY_ON_ENDPOINT
    : FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT;
}

export function isFalTryOnEndpoint(value: unknown): value is FalTryOnEndpoint {
  return typeof value === "string"
    && (FAL_TRY_ON_ENDPOINTS as readonly string[]).includes(value);
}

export function tryOnRenderModeForEndpoint(value: string | null | undefined): TryOnRenderMode {
  return value === FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT
    ? "garment-fidelity"
    : "fit-aware";
}

export function fashnCategoryForProduct(
  categoryKey: CatalogCategoryKey,
): FashnGarmentCategory {
  return categoryKey === "one-piece" ? "one-pieces" : categoryKey;
}
