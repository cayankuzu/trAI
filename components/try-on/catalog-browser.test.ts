import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterCatalogProducts,
  getCatalogAudience,
  getCatalogFilterOptions,
  getCatalogGarmentType,
  toggleCatalogFilterValue,
  type CatalogFilterProduct,
} from "@/components/try-on/catalog-browser";

const componentSource = readFileSync(new URL("./catalog-browser.tsx", import.meta.url), "utf8");

function product(
  id: string,
  audience: string,
  garmentType: string | undefined,
  category = `${audience} / ${garmentType ?? "Üst giyim"}`,
): CatalogFilterProduct {
  return {
    id,
    audience,
    garmentType,
    category,
    categoryKey: "tops",
  };
}

const products = [
  product("women-jacket", "Kadın", "Ceket"),
  product("men-jacket", "Erkek", "Ceket"),
  product("men-tee", "Erkek", "Tişört"),
  product("unisex-knit", "Unisex", "Kazak"),
];

describe("katalog filtreleri", () => {
  it("boş filtre seçimini Tümü olarak yorumlar ve bütün ürünleri korur", () => {
    expect(filterCatalogProducts(products, { audiences: [], garmentTypes: [] })).toEqual(products);
  });

  it("aynı grupta çoklu seçimi OR, gruplar arasında seçimi AND olarak uygular", () => {
    const filtered = filterCatalogProducts(products, {
      audiences: ["Kadın", "Erkek"],
      garmentTypes: ["Ceket", "Kazak"],
    });

    expect(filtered.map((item) => item.id)).toEqual(["women-jacket", "men-jacket"]);
  });

  it("birbiriyle eşleşmeyen filtrelerde boş sonuç döndürür", () => {
    expect(filterCatalogProducts(products, {
      audiences: ["Kadın"],
      garmentTypes: ["Kazak"],
    })).toEqual([]);
  });

  it("cinsiyet etiketlerini tek biçime getirir ve seçenekleri beklenen sırada listeler", () => {
    expect(getCatalogAudience(product("women", "women", "Tişört"))).toBe("Kadın");
    expect(getCatalogAudience(product("men", "MEN", "Tişört"))).toBe("Erkek");
    expect(getCatalogAudience(product("unisex", "unisex", "Tişört"))).toBe("Unisex");
    expect(getCatalogFilterOptions(products).audiences).toEqual(["Kadın", "Erkek", "Unisex"]);
  });

  it("garmentType yoksa mevcut kategori bilgisinden güvenli biçimde tür çıkarır", () => {
    expect(getCatalogGarmentType(product("legacy", "Erkek", undefined, "Erkek / Gömlek"))).toBe("Gömlek");
  });

  it("Tümü durumundan tek seçime, ardından çoklu seçime geçer ve son seçim kalkınca Tümü'ne döner", () => {
    expect(toggleCatalogFilterValue([], "Ceket")).toEqual(["Ceket"]);
    expect(toggleCatalogFilterValue(["Ceket"], "Kazak")).toEqual(["Ceket", "Kazak"]);
    expect(toggleCatalogFilterValue(["Ceket", "Kazak"], "Ceket")).toEqual(["Kazak"]);
    expect(toggleCatalogFilterValue(["Kazak"], "Kazak")).toEqual([]);
  });

  it("erişilebilir basılı durumları, filtre temizlemeyi ve boş durum eylemini sunar", () => {
    expect(componentSource).toContain('aria-labelledby="catalog-filter-title"');
    expect(componentSource).toContain("aria-pressed={selectedAudiences.length === 0}");
    expect(componentSource).toContain("aria-pressed={selectedGarmentTypes.includes(garmentType)}");
    expect(componentSource).toContain("Filtreleri temizle");
    expect(componentSource).toContain("Bu filtrelere uygun ürün bulunamadı");
    expect(componentSource).toContain("Tüm ürünleri göster");
  });
});
