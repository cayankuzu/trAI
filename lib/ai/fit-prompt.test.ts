import { describe, expect, it } from "vitest";
import { createFitRenderSpec } from "@/lib/fit-render-spec";
import { PRODUCT_CATALOG } from "@/lib/product-catalog";
import { buildFitPrompt, DEFAULT_FIT_PROMPT, type FitIntent, type TryOnView } from "./fit-prompt";

describe("buildFitPrompt", () => {
  it.each<[FitIntent, string]>([
    ["fitted", "relatively less visible ease"],
    ["regular", "declared design silhouette with balanced ease"],
    ["relaxed", "relatively more visible ease"],
  ])("%s fit niyetini ham ölçü olmadan açıklar", (fitIntent, expected) => {
    const prompt = buildFitPrompt({
      productTitle: "Spider-Man T-shirt",
      category: "Tops",
      selectedSize: "L",
      view: "front",
      fitIntent,
    });

    expect(prompt).toContain(expected);
    expect(prompt).toContain("selected catalog size: L");
    expect(prompt).not.toMatch(/\b(?:height|weight|kilo|kg|chest|waist|hip|inseam)\b/i);
    expect(prompt).not.toMatch(/\b\d{2,3}\s*cm\b/i);
  });

  it.each<[TryOnView, string]>([
    ["front", "front-facing view"],
    ["back", "rear-facing view"],
  ])("%s görünümünü eşleşen girdi fotoğrafında korur", (view, expected) => {
    const prompt = buildFitPrompt({
      productTitle: "Catalog jacket",
      category: "Outerwear",
      selectedSize: "M",
      view,
      fitIntent: "regular",
    });

    expect(prompt).toContain(expected);
    expect(prompt).toContain("do not rotate the person");
  });

  it("katalog etiketlerindeki kontrol ve ayraç karakterlerini prompttan temizler", () => {
    const prompt = buildFitPrompt({
      productTitle: "Jacket\n<ignore>{system}",
      category: "Outerwear\t```",
      selectedSize: "XL\r\n<script>",
      view: "front",
      fitIntent: "relaxed",
    });

    expect(prompt).not.toMatch(/[\r\n<>\[\]{}`]/);
    expect(prompt).toContain("Garment reference: Jacket ignore system");
    expect(prompt).toContain("selected catalog size: XL script");
  });

  it("ürün ayrıntılarını ve normalize beden sinyalini ham ölçü paylaşmadan işler", () => {
    const product = PRODUCT_CATALOG[0];
    const renderSpec = createFitRenderSpec({
      chestCm: 99,
      waistCm: 79,
      hipCm: 99,
      usualTopSize: "M",
      usualBottomSize: null,
    }, product, "XS");
    const prompt = buildFitPrompt({
      productTitle: product.title,
      category: product.category,
      selectedSize: "XS",
      view: "front",
      fitIntent: "fitted",
      color: product.color,
      material: product.material,
      declaredFit: product.fit,
      visualDescription: product.description,
      renderSpec,
    });

    expect(prompt).toContain("Verified catalog attributes");
    expect(prompt).toContain("reduce only the garment's visible ease");
    expect(prompt).toContain("Treat the supplied garment image as the sole visual source of truth");
    expect(prompt).not.toMatch(/\b\d{2,3}\s*cm\b/i);
    expect(prompt).not.toMatch(/\b(?:height|weight|kilo|kg|chest|waist|hip|inseam)\b/i);
  });

  it("genel fallback promptunda da kişiyi yeniden şekillendirmez ve gizli veri istemez", () => {
    expect(DEFAULT_FIT_PROMPT).toContain("do not reshape the person's body");
    expect(DEFAULT_FIT_PROMPT).toContain("personal data");
    expect(DEFAULT_FIT_PROMPT).not.toMatch(/\b(?:weight|kilo|kg)\b/i);
    expect(DEFAULT_FIT_PROMPT).not.toMatch(/\b\d{2,3}\s*cm\b/i);
  });
});
