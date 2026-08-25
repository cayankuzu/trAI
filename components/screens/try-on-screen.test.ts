import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TryOnDraftVariant } from "@/components/try-on-draft-provider";
import {
  buildTryOnPlan,
  isAppendOnlyUploadConflict,
  prepareGenerationVariants,
  providerModeForRenderMode,
  restoredResultToVariant,
  variantCanUseGarmentFidelityFallback,
  variantIsProviderSafetyFailure,
  variantNeedsGeneration,
} from "@/components/screens/try-on-screen";
import type { TryOnResult } from "@/lib/types";

const tryOnScreenSource = readFileSync(new URL("./try-on-screen.tsx", import.meta.url), "utf8");
const supabaseClientSource = readFileSync(new URL("../../lib/supabase/client.ts", import.meta.url), "utf8");

function variant(id: string, overrides: Partial<TryOnDraftVariant> = {}): TryOnDraftVariant {
  return {
    id,
    size: "M",
    view: "front",
    status: "queued",
    imageUrl: null,
    error: null,
    errorCode: null,
    retrySameRequest: true,
    fitIntent: "regular",
    fitScore: 90,
    sizeRecommendation: "M",
    ...overrides,
  };
}

describe("çoklu prova retry planı", () => {
  it("creates every selected size and view combination", () => {
    expect(buildTryOnPlan(["M", "L"], ["front", "back"])).toEqual([
      { size: "M", view: "front" },
      { size: "M", view: "back" },
      { size: "L", view: "front" },
      { size: "L", view: "back" },
    ]);
  });

  it("hazır sonuçları korur ve yalnız retry edilebilir hata/eksik sonuçları hedefler", () => {
    const ready = variant("ready", { status: "ready", imageUrl: "https://example.test/ready.webp" });
    const retryable = variant("retryable", { size: "L", status: "error", error: "geçici", retrySameRequest: true });
    const permanent = variant("permanent", { size: "XL", status: "error", error: "kalıcı", retrySameRequest: false });
    const plan = prepareGenerationVariants([ready, retryable, permanent]);

    expect(plan.targets.map((item) => item.id)).toEqual(["retryable"]);
    expect(plan.targetIds).toEqual(new Set(["retryable"]));
    expect(plan.variants[0]).toBe(ready);
    expect(plan.variants[1]).toMatchObject({
      id: "retryable",
      status: "queued",
      imageUrl: null,
      retrySameRequest: true,
      fitScore: 90,
    });
    expect(plan.variants[2]).toBe(permanent);
  });

  it("URL'siz hazır veya resume sonucu eksik kabul eder", () => {
    expect(variantNeedsGeneration(variant("ready-missing", { status: "ready", imageUrl: null }))).toBe(true);
    expect(variantNeedsGeneration(variant("resume", { status: "resume" }))).toBe(true);
    expect(variantNeedsGeneration(variant("ready", { status: "ready", imageUrl: "https://example.test/x.webp" }))).toBe(false);
  });

  it("accepts the existing-object conflict for an append-only upload retry", () => {
    expect(isAppendOnlyUploadConflict({ statusCode: "409" })).toBe(true);
    expect(isAppendOnlyUploadConflict({ status: 409 })).toBe(true);
    expect(isAppendOnlyUploadConflict({ statusCode: "403" })).toBe(false);
    expect(isAppendOnlyUploadConflict(new Error("network"))).toBe(false);
  });

  it("yalnız sağlayıcı güvenlik hatasını kontrollü yeni üretim için işaretler", () => {
    expect(variantIsProviderSafetyFailure(variant("safety", {
      status: "error",
      errorCode: "provider_safety",
      retrySameRequest: false,
    }))).toBe(true);
    expect(variantIsProviderSafetyFailure(variant("input", {
      status: "error",
      errorCode: "provider_input",
      retrySameRequest: false,
    }))).toBe(false);
  });

  it("güvenlik veya görünmez çıktı hatasında ürün odaklı FASHN yedeğini sunar", () => {
    expect(variantCanUseGarmentFidelityFallback(variant("safety", {
      status: "error",
      errorCode: "provider_safety",
      renderMode: "fit-aware",
    }))).toBe(true);
    expect(variantCanUseGarmentFidelityFallback(variant("output", {
      status: "error",
      errorCode: "provider_output",
      renderMode: "fit-aware",
    }))).toBe(true);
    expect(variantCanUseGarmentFidelityFallback(variant("input", {
      status: "error",
      errorCode: "provider_input",
      renderMode: "fit-aware",
    }))).toBe(false);
    expect(variantCanUseGarmentFidelityFallback(variant("fashn-output", {
      status: "error",
      errorCode: "provider_output",
      renderMode: "garment-fidelity",
    }))).toBe(false);
  });

  it("ürün detayını varsayılan FASHN, açık beta beden görünümünü FLUX modu olarak yollar", () => {
    expect(providerModeForRenderMode("garment-fidelity")).toBe("garment_fidelity");
    expect(providerModeForRenderMode("fit-aware")).toBe("fit_aware");
  });

  it("yenilenen sunucu sonucunu kayıpsız hazır varyanta dönüştürür", () => {
    const result: TryOnResult = {
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      imageUrl: "https://storage.example.test/result.webp?fresh=1",
      productUrl: "https://shop.example.test/product",
      createdAt: "2026-08-25T00:00:00.000Z",
      size: "L",
      view: "back",
      fitIntent: "relaxed",
      fitScore: 81,
      sizeRecommendation: "M",
      renderMode: "fit-aware",
    };

    expect(restoredResultToVariant(result)).toEqual({
      id: result.id,
      size: "L",
      view: "back",
      status: "ready",
      imageUrl: result.imageUrl,
      error: null,
      errorCode: null,
      retrySameRequest: false,
      fitIntent: "relaxed",
      fitScore: 81,
      sizeRecommendation: "M",
      renderMode: "fit-aware",
    });
  });

  it("Yenile butonu sayfayı yeniden yüklemeden yalnızca mevcut session sonucunu çeker", () => {
    expect(tryOnScreenSource).not.toContain("window.location.reload");
    expect(tryOnScreenSource).toContain("refreshSessionResults()");
    expect(tryOnScreenSource).toContain("/api/try-ons?sessionId=${encodeURIComponent(sessionId)}");
    expect(tryOnScreenSource).toContain("result.sessionId !== sessionId");
  });

  it("45 saniyelik yükleme sınırını gerçek Storage isteğine de bağlar", () => {
    expect(tryOnScreenSource).toContain("createBrowserClient({ signal })");
    expect(tryOnScreenSource).toContain("uploadFiles(intentPayload.data.intents, targetIds, uploadController.signal)");
    expect(supabaseClientSource).toContain("isSingleton: false");
    expect(supabaseClientSource).toContain("signal,");
    expect(tryOnScreenSource).toContain("}, 20_000);");
    expect(tryOnScreenSource).toContain("}, 45_000);");
  });

  it("geçici provider sonucunu yeni üretim açmadan aynı request ile bir kez otomatik kontrol eder", () => {
    expect(tryOnScreenSource).toContain('payload?.code === "provider_result_unavailable"');
    expect(tryOnScreenSource).toContain("PROVIDER_RESULT_RECOVERY_DELAYS_MS[recoveryAttempt]");
    expect(tryOnScreenSource).toContain("waitForAbortableDelay(recoveryDelay, controller.signal)");
  });

  it("beden modeli safety/çıktı hatasında ana eylemi FASHN ile yeni denemeye dönüştürür", () => {
    expect(tryOnScreenSource).toContain("const canRetryWithFashn = hasFitAwareOutputFailure");
    expect(tryOnScreenSource).toContain('providerMode: "garment_fidelity"');
    expect(tryOnScreenSource).toContain("Ürün detayıyla yeniden oluştur");
    expect(tryOnScreenSource).not.toContain("Alternatif modelle aynı fotoğrafı dene");
  });

  it("istemcide algılanan siyah sonucu safety yerine provider output olarak sınıflandırır", () => {
    expect(tryOnScreenSource).toContain('errorCode: "provider_output"');
  });
});
