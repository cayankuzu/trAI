import { describe, expect, it } from "vitest";
import {
  FAL_FIT_AWARE_TRY_ON_ENDPOINT,
  FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
  FAL_LEGACY_TRY_ON_ENDPOINT,
  FAL_PRIMARY_TRY_ON_ENDPOINT,
  FAL_SAFETY_FALLBACK_TRY_ON_ENDPOINT,
  FAL_TRY_ON_ENDPOINTS,
  falTryOnEndpointForMode,
  fashnCategoryForProduct,
  isFalTryOnEndpoint,
  tryOnRenderModeForEndpoint,
} from "./fal-endpoints";

describe("fal try-on endpoint allowlist", () => {
  it("varsayılan, geriye uyumlu ve açık ürün-sadakati modlarını FASHN'e eşler", () => {
    expect(falTryOnEndpointForMode()).toBe(FAL_PRIMARY_TRY_ON_ENDPOINT);
    expect(falTryOnEndpointForMode("primary")).toBe(FAL_PRIMARY_TRY_ON_ENDPOINT);
    expect(falTryOnEndpointForMode("safety_fallback")).toBe(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT);
    expect(falTryOnEndpointForMode("garment_fidelity")).toBe(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT);
    expect(FAL_PRIMARY_TRY_ON_ENDPOINT).toBe(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT);
    expect(FAL_SAFETY_FALLBACK_TRY_ON_ENDPOINT).toBe(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT);
  });

  it("yalnız açık beden-görünümü modunu FLUX 2 LoRA'ya eşler", () => {
    expect(falTryOnEndpointForMode("fit_aware")).toBe(FAL_FIT_AWARE_TRY_ON_ENDPOINT);
    expect(FAL_FIT_AWARE_TRY_ON_ENDPOINT).toBe("fal-ai/flux-2-lora-gallery/virtual-tryon");
  });

  it("FASHN, beden yönlendirmeli ve yalnız mevcut işler için legacy endpoint'leri benzersiz kabul eder", () => {
    expect(isFalTryOnEndpoint(FAL_PRIMARY_TRY_ON_ENDPOINT)).toBe(true);
    expect(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT).toBe("fal-ai/fashn/tryon/v1.6");
    expect(isFalTryOnEndpoint(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT)).toBe(true);
    expect(FAL_LEGACY_TRY_ON_ENDPOINT).toBe("fal-ai/flux-pro/v1/vto");
    expect(isFalTryOnEndpoint(FAL_LEGACY_TRY_ON_ENDPOINT)).toBe(true);
    expect(isFalTryOnEndpoint("fal-ai/unknown/model")).toBe(false);
    expect(isFalTryOnEndpoint(null)).toBe(false);
    expect(new Set(FAL_TRY_ON_ENDPOINTS).size).toBe(FAL_TRY_ON_ENDPOINTS.length);
  });

  it("katalog kategorilerini FASHN enumuna eşler", () => {
    expect(fashnCategoryForProduct("tops")).toBe("tops");
    expect(fashnCategoryForProduct("bottoms")).toBe("bottoms");
    expect(fashnCategoryForProduct("one-piece")).toBe("one-pieces");
  });

  it("sonuçların görsel yeteneğini kullanılan endpoint'ten açıklar", () => {
    expect(tryOnRenderModeForEndpoint(FAL_FIT_AWARE_TRY_ON_ENDPOINT)).toBe("fit-aware");
    expect(tryOnRenderModeForEndpoint(FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT)).toBe("garment-fidelity");
    expect(tryOnRenderModeForEndpoint(FAL_LEGACY_TRY_ON_ENDPOINT)).toBe("fit-aware");
  });
});
