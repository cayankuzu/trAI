import { describe, expect, it } from "vitest";
import { createFitRenderSpec } from "@/lib/fit-render-spec";
import { PRODUCT_CATALOG, type CatalogProduct } from "@/lib/product-catalog";
import type { ProfileData } from "@/lib/types";

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    fullName: "",
    gender: "other",
    heightCm: null,
    weightKg: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    usualTopSize: null,
    usualBottomSize: null,
    bottomSizeSystem: "EU",
    ...overrides,
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { ...PRODUCT_CATALOG[0], ...overrides };
}

describe("FitRenderSpec", () => {
  it("hedef vücut tablosunda seçilen beden başına farkları gözlenen beden adımıyla normalize eder", () => {
    const exact = profile({ chestCm: 99, waistCm: 79, hipCm: 99 });
    const medium = createFitRenderSpec(exact, product(), "M");
    const extraSmall = createFitRenderSpec(exact, product(), "XS");
    const extraLarge = createFitRenderSpec(exact, product(), "XL");

    expect(medium).toMatchObject({
      sizeGuideKind: "body",
      selectedSize: "M",
      selectedSizeOffset: 0,
      fitIntent: "regular",
      confidence: "high",
      evidence: {
        basis: "target-body-chart",
        coverage: 1,
        normalizedBodyDelta: 0,
        targetIsBodyMeasurement: true,
        garmentEaseKnown: false,
      },
      renderCues: {
        preserveBodyShape: true,
        preserveGarmentConstruction: true,
        silhouette: "regular",
        sizeAdjustment: "preserve-declared-cut",
        adjustmentStrength: "none",
      },
    });
    expect(medium.evidence.dimensions).toHaveLength(3);
    expect(medium.evidence.dimensions.every((dimension) => dimension.direction === "aligned")).toBe(true);

    expect(extraSmall).toMatchObject({
      selectedSizeOffset: -2,
      fitIntent: "fitted",
      evidence: { normalizedBodyDelta: 1 },
      renderCues: { sizeAdjustment: "reduce-visible-ease", adjustmentStrength: "moderate" },
    });
    expect(extraSmall.evidence.dimensions.every((dimension) => dimension.gradeStepDelta === 2)).toBe(true);

    expect(extraLarge).toMatchObject({
      selectedSizeOffset: 2,
      fitIntent: "relaxed",
      evidence: { normalizedBodyDelta: -1 },
      renderCues: { sizeAdjustment: "increase-visible-ease", adjustmentStrength: "moderate" },
    });
  });

  it("yalnız mevcut ve ilgili profil ölçülerini kullanıp ağırlıklı kapsama bildirir", () => {
    const spec = createFitRenderSpec(
      profile({ heightCm: 190, weightKg: 130, chestCm: 96 }),
      product(),
      "M",
    );

    expect(spec.evidence.coverage).toBe(0.65);
    expect(spec.evidence.dimensions.map((item) => item.dimension)).toEqual(["chest"]);
    expect(spec.evidence.dimensions[0]).toMatchObject({
      gradeStepDelta: -0.5,
      normalizedDelta: -0.25,
      direction: "below-target",
      relevanceWeight: 0.65,
    });
  });

  it("fiziksel ürün ölçüsü tablosunu vücut hedefi gibi kullanmaz veya sahte bolluk payı üretmez", () => {
    const garmentGuide = product({ sizeGuideKind: "garment" });
    const first = createFitRenderSpec(
      profile({ chestCm: 99, waistCm: 79, hipCm: 99, usualTopSize: "L" }),
      garmentGuide,
      "M",
    );
    const veryDifferentBody = createFitRenderSpec(
      profile({ chestCm: 150, waistCm: 130, hipCm: 145, usualTopSize: "L" }),
      garmentGuide,
      "M",
    );

    for (const spec of [first, veryDifferentBody]) {
      expect(spec).toMatchObject({
        sizeGuideKind: "garment",
        fitIntent: "fitted",
        confidence: "low",
        evidence: {
          basis: "garment-chart-unresolved",
          coverage: 0,
          dimensions: [],
          normalizedBodyDelta: null,
          targetIsBodyMeasurement: false,
          garmentEaseKnown: false,
        },
      });
      expect(spec.caveats.join(" ")).toContain("bolluk payı olmadan");
    }
  });

  it("tek satırlı vücut tablosunda varsayılan santimetre adımı uydurmaz", () => {
    const singleRow = product({
      availableSizes: ["M"],
      sizeGuide: [{ size: "M", chestCm: 99, waistCm: 79, hipCm: 99 }],
    });
    const spec = createFitRenderSpec(
      profile({ chestCm: 101, waistCm: 81, hipCm: 101 }),
      singleRow,
      "M",
    );

    expect(spec.evidence).toMatchObject({
      basis: "target-body-chart-ungraded",
      coverage: 0,
      dimensions: [],
      normalizedBodyDelta: null,
    });
    expect(spec).toMatchObject({
      recommendedSize: null,
      selectedSizeOffset: null,
      fitIntent: "unknown",
      confidence: "none",
      renderCues: { silhouette: "unspecified", adjustmentStrength: "none" },
    });
    expect(spec.caveats.join(" ")).toContain("beden geçiş adımı olmadığı");
  });

  it("tablo türü doğrulanmamışsa mevcut sayıları body chart varsayarak kullanmaz", () => {
    const unknownGuide = {
      ...product(),
      sizeGuideKind: undefined,
    } as unknown as CatalogProduct;
    const spec = createFitRenderSpec(
      profile({ chestCm: 99, waistCm: 79, hipCm: 99, usualTopSize: "M" }),
      unknownGuide,
      "M",
    );

    expect(spec).toMatchObject({
      sizeGuideKind: "unknown",
      recommendedSize: null,
      selectedSizeOffset: null,
      fitIntent: "unknown",
      confidence: "none",
      evidence: {
        basis: "unknown-chart-kind",
        coverage: 0,
        dimensions: [],
        normalizedBodyDelta: null,
      },
    });
  });

  it("ölçü yoksa alışılmış bedeni düşük güvenli kalıp yönü olarak kullanır", () => {
    const spec = createFitRenderSpec(profile({ usualTopSize: "L" }), product(), "XL");

    expect(spec).toMatchObject({
      recommendedSize: "L",
      selectedSizeOffset: 1,
      fitIntent: "relaxed",
      confidence: "low",
      evidence: { basis: "usual-size", coverage: 0, normalizedBodyDelta: null },
      renderCues: { adjustmentStrength: "subtle" },
    });
  });

  it("katalogda olmayan beden için render sinyali üretmez", () => {
    const spec = createFitRenderSpec(
      profile({ chestCm: 99, waistCm: 79, hipCm: 99 }),
      product(),
      "XXL",
    );

    expect(spec).toMatchObject({
      selectedSize: "XXL",
      selectedSizeOffset: null,
      fitIntent: "unknown",
      confidence: "none",
      evidence: { basis: "size-not-listed", dimensions: [], normalizedBodyDelta: null },
      renderCues: { silhouette: "unspecified", adjustmentStrength: "none" },
    });
  });

  it("çıktıya ham vücut ölçüsü, boy veya kilo taşımaz", () => {
    const spec = createFitRenderSpec(
      profile({
        heightCm: 187.7,
        weightKg: 123.4,
        chestCm: 97.3,
        waistCm: 77.2,
        hipCm: 98.1,
      }),
      product(),
      "M",
    );
    const serialized = JSON.stringify(spec);

    expect(serialized).not.toContain("heightCm");
    expect(serialized).not.toContain("weightKg");
    expect(serialized).not.toContain("chestCm");
    expect(serialized).not.toContain("waistCm");
    expect(serialized).not.toContain("hipCm");
    expect(serialized).not.toContain("187.7");
    expect(serialized).not.toContain("123.4");
    expect(serialized).not.toContain("97.3");
    expect(serialized).not.toContain("77.2");
    expect(serialized).not.toContain("98.1");
  });
});
