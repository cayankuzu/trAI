import { describe, expect, it } from "vitest";
import {
  getFitRecommendation,
  resolveGarmentType,
  type GarmentType,
} from "@/lib/fit-recommendation";
import { PRODUCT_CATALOG, type CatalogProduct } from "@/lib/product-catalog";
import type { ProfileData } from "@/lib/types";

type ProfileWithUsualSizes = Pick<ProfileData, "chestCm" | "waistCm" | "hipCm"> & {
  usualTopSize?: string | null;
  usualBottomSize?: string | null;
};

type ProductWithMachineType = CatalogProduct & {
  garmentType?: GarmentType;
  machine?: { garmentType?: GarmentType };
};

function profile(overrides: Partial<ProfileWithUsualSizes> = {}): ProfileWithUsualSizes {
  return {
    chestCm: null,
    waistCm: null,
    hipCm: null,
    ...overrides,
  };
}

function product(overrides: Partial<ProductWithMachineType> = {}): ProductWithMachineType {
  return {
    ...PRODUCT_CATALOG[0],
    ...overrides,
  };
}

describe("deterministik beden önerisi", () => {
  it("üst giyimde beden rehberindeki hedef vücut ölçülerine en yakın bedeni seçer", () => {
    const result = getFitRecommendation(
      profile({ chestCm: 99, waistCm: 79, hipCm: 99 }),
      product(),
    );

    expect(result.garmentType).toBe("top");
    expect(result.recommendedSize).toBe("M");
    expect(result.closeFitSize).toBe("S");
    expect(result.relaxedSize).toBe("L");
    expect(result.confidence).toBe("high");
    expect(result.assessments.find((item) => item.size === "M")).toEqual({
      size: "M",
      fitIntent: "regular",
      fitScore: 100,
      label: "En dengeli seçenek",
    });
  });

  it("makine okunur giysi türünü kategori metninden önce kullanır ve alt giyimde göğsü yok sayar", () => {
    const bottomProduct = product({
      category: "Tişört",
      machine: { garmentType: "bottom" },
      availableSizes: ["36", "38", "40"],
      sizeGuide: [
        { size: "36", chestCm: 70, waistCm: 68, hipCm: 92 },
        { size: "38", chestCm: 80, waistCm: 72, hipCm: 96 },
        { size: "40", chestCm: 90, waistCm: 76, hipCm: 100 },
      ],
    });
    const result = getFitRecommendation(
      profile({ chestCm: 150, waistCm: 72, hipCm: 96 }),
      bottomProduct,
    );

    expect(result.garmentType).toBe("bottom");
    expect(result.recommendedSize).toBe("38");
    expect(result.closeFitSize).toBe("36");
    expect(result.relaxedSize).toBe("40");
    expect(result.confidence).toBe("high");
  });

  it("kategori yedeğinden tek parça ürünü algılar ve üç ilgili ölçüyü değerlendirir", () => {
    const dress = {
      category: "Kadın / Elbise",
      availableSizes: ["S", "M", "L"],
      sizeGuide: [
        { size: "S", chestCm: 88, waistCm: 68, hipCm: 94 },
        { size: "M", chestCm: 94, waistCm: 74, hipCm: 100 },
        { size: "L", chestCm: 100, waistCm: 80, hipCm: 106 },
      ],
    };
    const result = getFitRecommendation(
      profile({ chestCm: 94, waistCm: 74, hipCm: 100 }),
      dress,
    );

    expect(resolveGarmentType(dress)).toBe("one-piece");
    expect(result.recommendedSize).toBe("M");
    expect(result.confidence).toBe("high");
  });

  it("ölçüler iki beden arasında kaldığında alışılmış bedeni yalnız yakın eşitlik bozucu olarak kullanır", () => {
    const atBoundary = profile({
      chestCm: 96,
      waistCm: 76,
      hipCm: 96,
      usualTopSize: "s",
    });
    const withTieBreaker = getFitRecommendation(atBoundary, product());
    const withoutTieBreaker = getFitRecommendation(
      { ...atBoundary, usualTopSize: null },
      product(),
    );

    expect(withTieBreaker.recommendedSize).toBe("S");
    expect(withTieBreaker.confidence).toBe("high");
    expect(withoutTieBreaker.recommendedSize).toBe("M");
  });

  it("ölçü yoksa alışılmış üst bedeni yalnız düşük güvenli fallback olarak kullanır", () => {
    const result = getFitRecommendation(profile({ usualTopSize: "l" }), product());

    expect(result.recommendedSize).toBe("L");
    expect(result.closeFitSize).toBe("M");
    expect(result.relaxedSize).toBe("XL");
    expect(result.confidence).toBe("low");
    expect(result.assessments.find((item) => item.size === "L")?.fitScore).toBe(65);
    expect(result.reason).toContain("düşük güvenli");
  });

  it("alt giyim fallback'inde usualBottomSize kullanır", () => {
    const bottom = product({
      garmentType: "bottom",
      availableSizes: ["36", "38", "39", "40"],
      sizeGuide: [],
    });
    const result = getFitRecommendation(profile({ usualTopSize: "M", usualBottomSize: "39" }), bottom);

    expect(result.recommendedSize).toBe("39");
    expect(result.closeFitSize).toBe("38");
    expect(result.relaxedSize).toBe("40");
    expect(result.confidence).toBe("low");
  });

  it("fiziksel kıyafet ölçüsü tablosunu vücut hedefi gibi karşılaştırmaz", () => {
    const garmentDimensionGuide = product({ sizeGuideKind: "garment" });
    const result = getFitRecommendation(
      profile({ chestCm: 99, waistCm: 79, hipCm: 99, usualTopSize: "L" }),
      garmentDimensionGuide,
    );

    expect(result.recommendedSize).toBe("L");
    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("genelde kullandığın beden");
  });

  it("ölçü ve alışılmış beden yoksa uydurma öneri veya skor üretmez", () => {
    const result = getFitRecommendation(profile(), product());

    expect(result.recommendedSize).toBeNull();
    expect(result.closeFitSize).toBeNull();
    expect(result.relaxedSize).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.assessments).toHaveLength(PRODUCT_CATALOG[0].availableSizes.length);
    expect(result.assessments.every((item) => item.fitIntent === "unknown" && item.fitScore === null)).toBe(true);
  });

  it("çıktıya ham profil ölçülerini veya sağlayıcı prompt'u eklemez", () => {
    const result = getFitRecommendation(
      profile({ chestCm: 97, waistCm: 77, hipCm: 98 }),
      product(),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("chestCm");
    expect(serialized).not.toContain("waistCm");
    expect(serialized).not.toContain("hipCm");
    expect(serialized).not.toContain("prompt");
    expect(result.reason).not.toMatch(/\d+\s*cm/i);
  });
});
