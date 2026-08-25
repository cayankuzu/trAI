import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getCatalogProduct, PRODUCT_CATALOG } from "@/lib/product-catalog";
import { readCatalogGarmentImage } from "@/lib/product-catalog-server";

describe("MVP ürün kataloğu", () => {
  it("benzersiz kimlikli ve kaynak bağlantılı ürünler içerir", () => {
    expect(PRODUCT_CATALOG).toHaveLength(11);
    expect(PRODUCT_CATALOG.map((product) => product.reference)).toEqual(expect.arrayContaining([
      "1081/190/600",
      "2724/596/802",
      "2560/677/122",
      "3247/120/252",
      "3478/224/952",
      "3563/734/800",
      "3043/335/811",
      "2578/335/428",
      "1269/190/812",
      "3043/335/800",
    ]));
    expect(new Set(PRODUCT_CATALOG.map((product) => product.id)).size).toBe(PRODUCT_CATALOG.length);
    for (const product of PRODUCT_CATALOG) {
      expect(getCatalogProduct(product.id)).toBe(product);
      expect(new URL(product.sourceUrl).protocol).toBe("https:");
      expect(product.images.length).toBeGreaterThanOrEqual(2);
      expect(product.availableSizes.length).toBeGreaterThan(0);
      expect(["Kadın", "Erkek", "Unisex"]).toContain(product.audience);
      expect(["Tişört", "Kazak", "Ceket", "Gömlek", "Jean", "Pantolon"]).toContain(product.productType);
      expect(product.garmentType).toBe(product.categoryKey === "bottoms" ? "bottom" : product.categoryKey === "tops" ? "top" : "one-piece");
      expect(product.sizeGuide.length).toBeGreaterThan(0);
      expect(product.sizeGuide.every((row) => product.availableSizes.includes(row.size))).toBe(true);
      expect(product.garmentImages.front).toBeTruthy();
      for (const source of Object.values(product.providerGarmentImages ?? {})) {
        const url = new URL(source);
        expect(url.protocol).toBe("https:");
        expect(["static.bershka.net", "img01.ztat.net"]).toContain(url.hostname);
      }
      for (const photoType of Object.values(product.providerGarmentPhotoTypes ?? {})) {
        expect(["auto", "model", "flat-lay"]).toContain(photoType);
      }
      expect(["auto", "model", "flat-lay"]).toContain(product.renderingProfile.garmentPhotoType);
      expect(product.renderingProfile.silhouetteDescription.length).toBeGreaterThan(10);
      expect(product.renderingProfile.viewDescriptions.front.length).toBeGreaterThan(10);
      expect(product.renderingProfile.referenceNote).toContain("fiziksel ürün ölçüleri");
    }
  });

  it("prova için seçilen yerel kıyafet görselini doğrular", async () => {
    const garments = await Promise.all(PRODUCT_CATALOG.flatMap((product) => [
      readCatalogGarmentImage(product.id, "front", { preferHighResolution: false }),
      readCatalogGarmentImage(product.id, "back", { preferHighResolution: false }),
    ]));
    for (const garment of garments) {
      expect(garment.contentType).toBe("image/png");
      expect(garment.extension).toBe("png");
      expect(garment.garmentPhotoType).toBe("flat-lay");
      expect(garment.bytes.byteLength).toBeGreaterThan(1_000);
      const metadata = await sharp(Buffer.from(garment.bytes)).metadata();
      expect(metadata.width).toBe(1024);
      expect(metadata.height).toBe(1024);
    }
    const product = PRODUCT_CATALOG[0];
    expect(product).toBeDefined();
    const front = garments[0];
    await expect(readCatalogGarmentImage(product.id, "front", { preferHighResolution: false }))
      .resolves.toBe(front);
  });
});
