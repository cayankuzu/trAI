"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/product-catalog";

export type CatalogFilterProduct = Pick<
  CatalogProduct,
  "id" | "category" | "categoryKey"
> & {
  audience: string;
  garmentType?: string;
  productType?: string;
};

export type CatalogFilterState = {
  audiences: readonly string[];
  garmentTypes: readonly string[];
};

const AUDIENCE_ORDER = ["Kadın", "Erkek", "Unisex"] as const;
const CATEGORY_KEY_LABELS: Record<CatalogProduct["categoryKey"], string> = {
  tops: "Üst giyim",
  bottoms: "Alt giyim",
  "one-piece": "Tek parça",
};

function normalizedFilterValue(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function getCatalogAudience(product: CatalogFilterProduct) {
  const audience = product.audience.trim();
  const normalized = normalizedFilterValue(audience);

  if (normalized.includes("unisex")) return "Unisex";
  if (normalized.includes("kadın") || normalized.includes("women") || normalized.includes("female")) return "Kadın";
  if (normalized.includes("erkek") || normalized === "men" || normalized.includes("male")) return "Erkek";
  return audience || "Unisex";
}

export function getCatalogGarmentType(product: CatalogFilterProduct) {
  const explicitType = product.productType?.trim()
    ?? (product.garmentType && !["top", "bottom", "one-piece"].includes(product.garmentType)
      ? product.garmentType.trim()
      : "");
  if (explicitType) return explicitType;

  const categoryParts = product.category
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return categoryParts.at(-1) || CATEGORY_KEY_LABELS[product.categoryKey];
}

export function getCatalogFilterOptions(products: readonly CatalogFilterProduct[]) {
  const audiences = [...new Set([...AUDIENCE_ORDER, ...products.map(getCatalogAudience)])].sort((left, right) => {
    const leftIndex = AUDIENCE_ORDER.indexOf(left as (typeof AUDIENCE_ORDER)[number]);
    const rightIndex = AUDIENCE_ORDER.indexOf(right as (typeof AUDIENCE_ORDER)[number]);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right, "tr");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  const garmentTypes = [...new Set(products.map(getCatalogGarmentType))]
    .sort((left, right) => left.localeCompare(right, "tr"));

  return { audiences, garmentTypes };
}

export function filterCatalogProducts<T extends CatalogFilterProduct>(
  products: readonly T[],
  filters: CatalogFilterState,
) {
  const audienceFilters = new Set(filters.audiences);
  const garmentTypeFilters = new Set(filters.garmentTypes);

  return products.filter((product) => {
    const audienceMatches = audienceFilters.size === 0 || audienceFilters.has(getCatalogAudience(product));
    const garmentTypeMatches = garmentTypeFilters.size === 0 || garmentTypeFilters.has(getCatalogGarmentType(product));
    return audienceMatches && garmentTypeMatches;
  });
}

export function toggleCatalogFilterValue(selected: readonly string[], value: string) {
  if (selected.length === 0) return [value];
  if (selected.includes(value)) return selected.filter((item) => item !== value);
  return [...selected, value];
}

type CatalogBrowserProps = {
  products: readonly CatalogProduct[];
  selectedProductId: string | null;
  disabled?: boolean;
  onChooseProduct: (productId: string) => void;
};

export function CatalogBrowser({
  products,
  selectedProductId,
  disabled = false,
  onChooseProduct,
}: CatalogBrowserProps) {
  const [selectedAudiences, setSelectedAudiences] = useState<readonly string[]>([]);
  const [selectedGarmentTypes, setSelectedGarmentTypes] = useState<readonly string[]>([]);
  const options = useMemo(() => getCatalogFilterOptions(products), [products]);
  const audienceCounts = useMemo(() => new Map(
    options.audiences.map((audience) => [
      audience,
      products.filter((product) => getCatalogAudience(product) === audience).length,
    ]),
  ), [options.audiences, products]);
  const garmentTypeCounts = useMemo(() => new Map(
    options.garmentTypes.map((garmentType) => [
      garmentType,
      products.filter((product) => getCatalogGarmentType(product) === garmentType).length,
    ]),
  ), [options.garmentTypes, products]);
  const visibleProducts = useMemo(
    () => filterCatalogProducts(products, {
      audiences: selectedAudiences,
      garmentTypes: selectedGarmentTypes,
    }),
    [products, selectedAudiences, selectedGarmentTypes],
  );
  const filtersAreActive = selectedAudiences.length > 0 || selectedGarmentTypes.length > 0;
  const selectedProductIsHidden = Boolean(
    selectedProductId && !visibleProducts.some((product) => product.id === selectedProductId),
  );

  function resetFilters() {
    setSelectedAudiences([]);
    setSelectedGarmentTypes([]);
  }

  return (
    <div className="catalog-browser">
      <section className="catalog-filter-panel" aria-labelledby="catalog-filter-title">
        <div className="catalog-filter-summary">
          <div>
            <strong id="catalog-filter-title">Ürün kataloğu</strong>
            <output aria-live="polite">
              {visibleProducts.length === products.length
                ? `${products.length} ürün`
                : `${products.length} üründen ${visibleProducts.length} ürün`}
            </output>
          </div>
          {filtersAreActive ? (
            <button type="button" onClick={resetFilters}>Filtreleri temizle</button>
          ) : null}
        </div>

        <div className="catalog-filter-groups">
          <fieldset>
            <legend>Cinsiyet</legend>
            <div className="catalog-filter-chips">
              <button
                type="button"
                aria-pressed={selectedAudiences.length === 0}
                onClick={() => setSelectedAudiences([])}
              >
                Tümü
              </button>
              {options.audiences.map((audience) => (
                <button
                  type="button"
                  key={audience}
                  aria-pressed={selectedAudiences.includes(audience)}
                  onClick={() => setSelectedAudiences((current) => toggleCatalogFilterValue(current, audience))}
                >
                  <span>{audience}</span><small>{audienceCounts.get(audience) ?? 0}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Kategori</legend>
            <div className="catalog-filter-chips">
              <button
                type="button"
                aria-pressed={selectedGarmentTypes.length === 0}
                onClick={() => setSelectedGarmentTypes([])}
              >
                Tümü
              </button>
              {options.garmentTypes.map((garmentType) => (
                <button
                  type="button"
                  key={garmentType}
                  aria-pressed={selectedGarmentTypes.includes(garmentType)}
                  onClick={() => setSelectedGarmentTypes((current) => toggleCatalogFilterValue(current, garmentType))}
                >
                  <span>{garmentType}</span><small>{garmentTypeCounts.get(garmentType) ?? 0}</small>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {selectedProductIsHidden ? (
        <div className="catalog-selection-notice" role="status">
          <span>Seçili ürün filtrelerin dışında kaldı.</span>
          <button type="button" onClick={resetFilters}>Seçili ürünü göster</button>
        </div>
      ) : null}

      {visibleProducts.length > 0 ? (
        <div className="compact-product-grid">
          {visibleProducts.map((product) => {
            const selected = product.id === selectedProductId;
            const cover = product.images[0];
            if (!cover) return null;

            return (
              <button
                className={`compact-product-card ${selected ? "is-selected" : ""}`}
                type="button"
                key={product.id}
                aria-pressed={selected}
                onClick={() => onChooseProduct(product.id)}
                disabled={disabled}
              >
                <span className="compact-product-image">
                  <Image src={cover.src} alt={cover.alt} fill sizes="120px" />
                </span>
                <span>
                  <small>{product.brand} · {getCatalogAudience(product)}</small>
                  <strong>{product.title}</strong>
                  <em>{getCatalogGarmentType(product)} · {product.price}</em>
                </span>
                <b aria-hidden>{selected ? "✓" : "+"}</b>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="catalog-empty-state" role="status">
          <span aria-hidden>⌕</span>
          <strong>Bu filtrelere uygun ürün bulunamadı</strong>
          <p>Başka bir kategori seçebilir veya tüm ürünlere dönebilirsin.</p>
          <button type="button" onClick={resetFilters}>Tüm ürünleri göster</button>
        </div>
      )}
    </div>
  );
}
