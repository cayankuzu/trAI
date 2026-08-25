import type { CatalogProduct } from "@/lib/product-catalog";
import type { ProfileData } from "@/lib/types";

export type GarmentType = "top" | "bottom" | "one-piece";
export type FitConfidence = "high" | "medium" | "low" | "none";
export type FitIntent = "fitted" | "regular" | "relaxed" | "unknown";

export type FitSizeAssessment = {
  size: string;
  fitIntent: FitIntent;
  /** Similarity to the catalog's target body-measurement row, not a fit guarantee. */
  fitScore: number | null;
  label: string;
};

export type FitRecommendation = {
  garmentType: GarmentType;
  recommendedSize: string | null;
  closeFitSize: string | null;
  relaxedSize: string | null;
  confidence: FitConfidence;
  reason: string;
  assessments: FitSizeAssessment[];
};

type MeasurementKey = "chestCm" | "waistCm" | "hipCm";

type FitProfile = Pick<ProfileData, MeasurementKey> & {
  usualTopSize?: string | null;
  usualBottomSize?: string | null;
};

type FitSizeGuideRow = {
  size: string;
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
};

type FitProduct = Omit<Pick<CatalogProduct, "category" | "availableSizes" | "sizeGuide">, "sizeGuide"> & {
  sizeGuide: readonly FitSizeGuideRow[];
  categoryKey?: "tops" | "bottoms" | "one-piece" | string | null;
  sizeGuideKind?: "body" | "garment" | string | null;
  garmentType?: GarmentType | string | null;
  machine?: {
    garmentType?: GarmentType | string | null;
  } | null;
};

type ScoredSize = {
  index: number;
  size: string;
  distance: number;
  fitScore: number;
};

const MEASUREMENT_KEYS: readonly MeasurementKey[] = ["chestCm", "waistCm", "hipCm"];
const DEFAULT_GUIDE_STEP_CM = 6;
const PREFERRED_SIZE_TIE_DISTANCE = 0.12;

const GARMENT_WEIGHTS: Record<GarmentType, Record<MeasurementKey, number>> = {
  top: { chestCm: 0.65, waistCm: 0.25, hipCm: 0.1 },
  bottom: { chestCm: 0, waistCm: 0.55, hipCm: 0.45 },
  "one-piece": { chestCm: 0.35, waistCm: 0.3, hipCm: 0.35 },
};

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLocaleLowerCase("tr-TR")
    .trim();
}

function parseGarmentType(value: unknown): GarmentType | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value).replace(/[\s_]+/g, "-");
  if (["top", "upper", "upper-body"].includes(normalized)) return "top";
  if (["bottom", "lower", "lower-body"].includes(normalized)) return "bottom";
  if (["one-piece", "onepiece", "dress", "full-body"].includes(normalized)) return "one-piece";
  return null;
}

export function resolveGarmentType(product: FitProduct): GarmentType {
  const machineType = parseGarmentType(product.machine?.garmentType)
    ?? parseGarmentType(product.garmentType)
    ?? parseGarmentType(product.categoryKey === "tops" ? "top" : product.categoryKey === "bottoms" ? "bottom" : product.categoryKey);
  if (machineType) return machineType;

  const category = normalizeText(product.category);
  if (["elbise", "tulum", "dress", "jumpsuit", "one-piece", "one piece"].some((word) => category.includes(word))) {
    return "one-piece";
  }
  if (["pantolon", "jean", "kot", "sort", "etek", "tayt", "trouser", "pants", "skirt", "shorts"].some((word) => category.includes(word))) {
    return "bottom";
  }
  if (["tisort", "t-shirt", "shirt", "gomlek", "bluz", "kazak", "sweat", "hoodie", "ceket", "mont", "ust", "top"].some((word) => category.includes(word))) {
    return "top";
  }

  // The current MVP catalog is upper-body led. Unknown legacy categories retain
  // that behavior until they gain an explicit machine-readable garmentType.
  return "top";
}

function validMeasurement(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedSize(value: string) {
  return value.trim().toLocaleUpperCase("tr-TR");
}

function orderedSizes(product: FitProduct) {
  const source = product.availableSizes.length > 0
    ? product.availableSizes
    : product.sizeGuide.map((row) => row.size);
  const seen = new Set<string>();
  return source.flatMap((size) => {
    const trimmed = size.trim();
    const normalized = normalizedSize(trimmed);
    if (!trimmed || seen.has(normalized)) return [];
    seen.add(normalized);
    return [trimmed];
  });
}

function median(values: number[]) {
  if (values.length === 0) return DEFAULT_GUIDE_STEP_CM;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function guideStep(rows: readonly FitSizeGuideRow[], key: MeasurementKey) {
  const values = rows
    .map((row) => row[key])
    .filter(validMeasurement);
  const differences = values.slice(1).flatMap((value, index) => {
    const difference = Math.abs(value - values[index]);
    return difference > 0 ? [difference] : [];
  });
  return Math.max(2, median(differences));
}

function preferredSizes(profile: FitProfile, garmentType: GarmentType) {
  const candidates = garmentType === "top"
    ? [profile.usualTopSize]
    : garmentType === "bottom"
      ? [profile.usualBottomSize]
      : [profile.usualTopSize, profile.usualBottomSize];
  return candidates.flatMap((candidate) => typeof candidate === "string" && candidate.trim()
    ? [normalizedSize(candidate)]
    : []);
}

function confidenceFor(coverage: number, usedMeasurementCount: number): FitConfidence {
  if (coverage >= 0.75 && usedMeasurementCount >= 2) return "high";
  if (coverage >= 0.5) return "medium";
  if (coverage > 0) return "low";
  return "none";
}

function measuredReason(confidence: Exclude<FitConfidence, "none">) {
  if (confidence === "high") {
    return "Profilindeki ilgili ölçüler, ürünün hedef vücut ölçüsü rehberiyle birlikte değerlendirildi.";
  }
  if (confidence === "medium") {
    return "Mevcut profil ölçüleri ürünün hedef vücut ölçüsü rehberiyle karşılaştırıldı; eksik ölçüler güveni sınırlar.";
  }
  return "Sınırlı profil ölçüsüyle yaklaşık bir beden önerisi hesaplandı.";
}

function labelFor(index: number, recommendedIndex: number | null, hasScore: boolean) {
  if (recommendedIndex === null) return "Öneri için ölçü gerekli";
  if (!hasScore) return "Bu beden için rehber verisi eksik";
  if (index === recommendedIndex) return "En dengeli seçenek";
  if (index === recommendedIndex - 1) return "Daha dar görünüm";
  if (index === recommendedIndex + 1) return "Daha rahat görünüm";
  return index < recommendedIndex ? "Belirgin dar olabilir" : "Belirgin bol olabilir";
}

function intentFor(index: number, recommendedIndex: number | null): FitIntent {
  if (recommendedIndex === null) return "unknown";
  if (index === recommendedIndex) return "regular";
  return index < recommendedIndex ? "fitted" : "relaxed";
}

function recommendationFromIndex(
  garmentType: GarmentType,
  sizes: string[],
  recommendedIndex: number | null,
  confidence: FitConfidence,
  reason: string,
  scores: Map<number, number>,
): FitRecommendation {
  return {
    garmentType,
    recommendedSize: recommendedIndex === null ? null : sizes[recommendedIndex],
    closeFitSize: recommendedIndex !== null && recommendedIndex > 0 ? sizes[recommendedIndex - 1] : null,
    relaxedSize: recommendedIndex !== null && recommendedIndex < sizes.length - 1 ? sizes[recommendedIndex + 1] : null,
    confidence,
    reason,
    assessments: sizes.map((size, index) => {
      const fitScore = scores.get(index) ?? null;
      return {
        size,
        fitIntent: intentFor(index, recommendedIndex),
        fitScore,
        label: labelFor(index, recommendedIndex, fitScore !== null),
      };
    }),
  };
}

/**
 * Compares profile measurements with catalog target-body rows. It intentionally
 * returns no raw measurements and must not be treated as physical garment sizing.
 */
export function getFitRecommendation(profile: FitProfile, product: FitProduct): FitRecommendation {
  const garmentType = resolveGarmentType(product);
  const sizes = orderedSizes(product);
  const weights = GARMENT_WEIGHTS[garmentType];
  const rowsBySize = new Map(
    product.sizeGuide.map((row) => [normalizedSize(row.size), row] as const),
  );
  const preferred = preferredSizes(profile, garmentType);

  if (sizes.length === 0) {
    return recommendationFromIndex(
      garmentType,
      sizes,
      null,
      "none",
      "Bu ürün için değerlendirilebilir bir beden bulunmuyor.",
      new Map(),
    );
  }

  // Only target-body guides can be compared with a person's measurements.
  // Garment-dimension tables require ease/allowance data and therefore fall
  // back to the user's usual size rather than producing false precision.
  const hasBodyGuide = product.sizeGuideKind !== "garment";
  const supportedDimensions = hasBodyGuide
    ? MEASUREMENT_KEYS.filter((key) => (
      weights[key] > 0 && product.sizeGuide.some((row) => validMeasurement(row[key]))
    ))
    : [];
  const usedDimensions = supportedDimensions.filter((key) => validMeasurement(profile[key]));
  const supportedWeight = supportedDimensions.reduce((sum, key) => sum + weights[key], 0);
  const usedWeight = usedDimensions.reduce((sum, key) => sum + weights[key], 0);
  const coverage = supportedWeight > 0 ? usedWeight / supportedWeight : 0;
  const measuredConfidence = confidenceFor(coverage, usedDimensions.length);
  const steps = Object.fromEntries(
    MEASUREMENT_KEYS.map((key) => [key, guideStep(product.sizeGuide, key)]),
  ) as Record<MeasurementKey, number>;

  const scoredSizes: ScoredSize[] = [];
  const scores = new Map<number, number>();
  if (usedWeight > 0) {
    sizes.forEach((size, index) => {
      const row = rowsBySize.get(normalizedSize(size));
      if (!row) return;

      let weightedDistance = 0;
      let coveredWeight = 0;
      for (const key of usedDimensions) {
        const target = row[key];
        const actual = profile[key];
        if (!validMeasurement(target) || !validMeasurement(actual)) continue;
        weightedDistance += weights[key] * Math.abs(actual - target) / steps[key];
        coveredWeight += weights[key];
      }
      if (coveredWeight === 0) return;

      // Missing row values are conservatively penalized instead of allowing an
      // incomplete guide row to win against a fully described size.
      const missingWeight = Math.max(0, usedWeight - coveredWeight);
      const distance = (weightedDistance + missingWeight * 1.5) / usedWeight;
      const fitScore = Math.max(0, Math.min(100, Math.round(100 - distance * 30)));
      scoredSizes.push({ index, size, distance, fitScore });
      scores.set(index, fitScore);
    });
  }

  if (scoredSizes.length > 0) {
    scoredSizes.sort((left, right) => left.distance - right.distance || right.index - left.index);
    const best = scoredSizes[0];
    const preferredCandidate = preferred.flatMap((preferredSize) => {
      const candidate = scoredSizes.find((item) => normalizedSize(item.size) === preferredSize);
      return candidate ? [candidate] : [];
    }).find((candidate) => candidate.distance - best.distance <= PREFERRED_SIZE_TIE_DISTANCE);
    const selected = preferredCandidate ?? best;
    const confidence = measuredConfidence === "none" ? "low" : measuredConfidence;
    return recommendationFromIndex(
      garmentType,
      sizes,
      selected.index,
      confidence,
      measuredReason(confidence),
      scores,
    );
  }

  const preferredIndex = preferred.flatMap((preferredSize) => {
    const index = sizes.findIndex((size) => normalizedSize(size) === preferredSize);
    return index >= 0 ? [index] : [];
  })[0];
  if (preferredIndex !== undefined) {
    sizes.forEach((_, index) => {
      scores.set(index, Math.max(20, 65 - Math.abs(index - preferredIndex) * 15));
    });
    return recommendationFromIndex(
      garmentType,
      sizes,
      preferredIndex,
      "low",
      "Ölçü verisi yeterli olmadığı için genelde kullandığın beden düşük güvenli başlangıç noktası olarak seçildi.",
      scores,
    );
  }

  return recommendationFromIndex(
    garmentType,
    sizes,
    null,
    "none",
    "Beden önerisi için ilgili vücut ölçülerini veya genelde kullandığın bedeni ekle.",
    scores,
  );
}
