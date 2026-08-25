import {
  getFitRecommendation,
  resolveGarmentType,
  type FitConfidence,
  type FitIntent,
  type GarmentType,
} from "@/lib/fit-recommendation";
import type { CatalogProduct, CatalogSizeRow } from "@/lib/product-catalog";
import type { ProfileData } from "@/lib/types";

type ProfileMeasurementKey = "chestCm" | "waistCm" | "hipCm";
export type FitRenderDimension = "chest" | "waist" | "hip";
export type FitRenderGuideKind = "body" | "garment" | "unknown";
export type FitRenderEvidenceBasis =
  | "target-body-chart"
  | "target-body-chart-ungraded"
  | "usual-size"
  | "garment-chart-unresolved"
  | "unknown-chart-kind"
  | "insufficient-data"
  | "size-not-listed";

export type NormalizedFitDimensionDelta = {
  dimension: FitRenderDimension;
  /**
   * Profile minus target-body-chart value, expressed in observed chart grade
   * steps and clamped to [-3, 3]. This is not garment ease.
   */
  gradeStepDelta: number;
  /** Bounded [-1, 1] rendering signal derived from gradeStepDelta. */
  normalizedDelta: number;
  direction: "above-target" | "aligned" | "below-target";
  relevanceWeight: number;
};

export type FitRenderSpec = {
  version: 1;
  selectedSize: string;
  garmentType: GarmentType;
  sizeGuideKind: FitRenderGuideKind;
  declaredProductFit: string | null;
  recommendedSize: string | null;
  selectedSizeOffset: number | null;
  fitIntent: FitIntent;
  confidence: FitConfidence;
  evidence: {
    basis: FitRenderEvidenceBasis;
    /** Relevant measurement weight represented by normalized deltas, [0, 1]. */
    coverage: number;
    dimensions: NormalizedFitDimensionDelta[];
    /** Positive means the profile is above the selected target-body row. */
    normalizedBodyDelta: number | null;
    targetIsBodyMeasurement: boolean;
    garmentEaseKnown: false;
  };
  renderCues: {
    preserveBodyShape: true;
    preserveGarmentConstruction: true;
    silhouette: "fitted" | "regular" | "relaxed" | "unspecified";
    sizeAdjustment: "reduce-visible-ease" | "preserve-declared-cut" | "increase-visible-ease";
    adjustmentStrength: "none" | "subtle" | "moderate";
  };
  caveats: string[];
};

export type FitRenderProfile = Pick<
  ProfileData,
  "chestCm" | "waistCm" | "hipCm" | "usualTopSize" | "usualBottomSize"
>;

export type FitRenderProduct = Pick<
  CatalogProduct,
  "category" | "categoryKey" | "availableSizes" | "sizeGuide" | "sizeGuideKind" | "fit"
>;

const DIMENSIONS: ReadonlyArray<{
  profileKey: ProfileMeasurementKey;
  dimension: FitRenderDimension;
}> = [
  { profileKey: "chestCm", dimension: "chest" },
  { profileKey: "waistCm", dimension: "waist" },
  { profileKey: "hipCm", dimension: "hip" },
];

const RELEVANCE_WEIGHTS: Record<GarmentType, Record<ProfileMeasurementKey, number>> = {
  top: { chestCm: 0.65, waistCm: 0.25, hipCm: 0.1 },
  bottom: { chestCm: 0, waistCm: 0.55, hipCm: 0.45 },
  "one-piece": { chestCm: 0.35, waistCm: 0.3, hipCm: 0.35 },
};

const ALIGNMENT_THRESHOLD = 0.15;

function normalizeSize(value: string) {
  return value.trim().toLocaleUpperCase("tr-TR");
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Uses only observed adjacent chart grades; it never inserts a default cm step. */
function observedGuideStep(rows: readonly CatalogSizeRow[], key: ProfileMeasurementKey) {
  const differences: number[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]?.[key];
    const current = rows[index]?.[key];
    if (!finitePositive(previous) || !finitePositive(current)) continue;
    const difference = Math.abs(current - previous);
    if (difference > 0) differences.push(difference);
  }
  return median(differences);
}

function guideKind(product: FitRenderProduct): FitRenderGuideKind {
  if (product.sizeGuideKind === "body" || product.sizeGuideKind === "garment") {
    return product.sizeGuideKind;
  }
  return "unknown";
}

function orderedSizes(product: FitRenderProduct) {
  const source = product.availableSizes.length > 0
    ? product.availableSizes
    : product.sizeGuide.map((row) => row.size);
  const seen = new Set<string>();
  return source.flatMap((size) => {
    const normalized = normalizeSize(size);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [size.trim()];
  });
}

function hasUsualSizeEvidence(
  profile: FitRenderProfile,
  garmentType: GarmentType,
  sizes: string[],
) {
  const candidates = garmentType === "top"
    ? [profile.usualTopSize]
    : garmentType === "bottom"
      ? [profile.usualBottomSize]
      : [profile.usualTopSize, profile.usualBottomSize];
  const normalizedSizes = new Set(sizes.map(normalizeSize));
  return candidates.some((candidate) => (
    typeof candidate === "string" && normalizedSizes.has(normalizeSize(candidate))
  ));
}

function normalizedDimensionDeltas(
  profile: FitRenderProfile,
  product: FitRenderProduct,
  selectedRow: CatalogSizeRow | undefined,
  garmentType: GarmentType,
) {
  if (!selectedRow) return [];
  const weights = RELEVANCE_WEIGHTS[garmentType];
  return DIMENSIONS.flatMap(({ profileKey, dimension }) => {
    const relevanceWeight = weights[profileKey];
    const actual = profile[profileKey];
    const target = selectedRow[profileKey];
    const step = observedGuideStep(product.sizeGuide, profileKey);
    if (relevanceWeight <= 0 || !finitePositive(actual) || !finitePositive(target) || !step) return [];

    const gradeStepDelta = round(clamp((actual - target) / step, -3, 3));
    const normalizedDelta = round(clamp(gradeStepDelta / 2, -1, 1));
    const direction = normalizedDelta > ALIGNMENT_THRESHOLD
      ? "above-target" as const
      : normalizedDelta < -ALIGNMENT_THRESHOLD
        ? "below-target" as const
        : "aligned" as const;
    return [{ dimension, gradeStepDelta, normalizedDelta, direction, relevanceWeight }];
  });
}

function compositeDelta(dimensions: NormalizedFitDimensionDelta[]) {
  const usedWeight = dimensions.reduce((sum, item) => sum + item.relevanceWeight, 0);
  if (usedWeight <= 0) return null;
  return round(dimensions.reduce(
    (sum, item) => sum + item.normalizedDelta * item.relevanceWeight,
    0,
  ) / usedWeight);
}

function renderCues(fitIntent: FitIntent, sizeOffset: number | null): FitRenderSpec["renderCues"] {
  const magnitude = Math.abs(sizeOffset ?? 0);
  const adjustmentStrength = fitIntent === "unknown" || fitIntent === "regular"
    ? "none"
    : magnitude >= 2 ? "moderate" : "subtle";
  return {
    preserveBodyShape: true,
    preserveGarmentConstruction: true,
    silhouette: fitIntent === "unknown" ? "unspecified" : fitIntent,
    sizeAdjustment: fitIntent === "fitted"
      ? "reduce-visible-ease"
      : fitIntent === "relaxed"
        ? "increase-visible-ease"
        : "preserve-declared-cut",
    adjustmentStrength,
  };
}

function evidenceBasis(input: {
  selectedListed: boolean;
  kind: FitRenderGuideKind;
  dimensions: NormalizedFitDimensionDelta[];
  hasComparableButUngradedDimension: boolean;
  hasUsualSizeEvidence: boolean;
}): FitRenderEvidenceBasis {
  if (!input.selectedListed) return "size-not-listed";
  if (input.kind === "garment") return "garment-chart-unresolved";
  if (input.kind === "unknown") return "unknown-chart-kind";
  if (input.dimensions.length > 0) return "target-body-chart";
  if (input.hasComparableButUngradedDimension) return "target-body-chart-ungraded";
  if (input.hasUsualSizeEvidence) return "usual-size";
  return "insufficient-data";
}

function basisSupportsFitIntent(basis: FitRenderEvidenceBasis) {
  return basis === "target-body-chart"
    || basis === "usual-size"
    || basis === "garment-chart-unresolved";
}

function confidenceForSpec(basis: FitRenderEvidenceBasis, confidence: FitConfidence): FitConfidence {
  return basisSupportsFitIntent(basis) ? confidence : "none";
}

function caveatsFor(basis: FitRenderEvidenceBasis) {
  const common = "Bu sinyal yalnız görsel kalıp yönlendirmesidir; fiziksel beden veya satın alma garantisi değildir.";
  if (basis === "target-body-chart") {
    return [
      "Normalize farklar profil ile hedef vücut ölçüsü satırını karşılaştırır; ürünün fiziksel ölçüsünü veya gerçek bolluk payını göstermez.",
      common,
    ];
  }
  if (basis === "target-body-chart-ungraded") {
    return [
      "Hedef vücut tablosunda güvenilir bir beden geçiş adımı olmadığı için ölçü farkı normalize edilmedi.",
      common,
    ];
  }
  if (basis === "garment-chart-unresolved") {
    return [
      "Fiziksel ürün ölçüsü tablosu, doğrulanmış bolluk payı olmadan vücut ölçüleriyle karşılaştırılmadı.",
      common,
    ];
  }
  if (basis === "unknown-chart-kind") {
    return [
      "Beden tablosunun vücut hedefi mi ürün ölçüsü mü olduğu doğrulanamadığı için ölçü farkı üretilmedi.",
      common,
    ];
  }
  if (basis === "usual-size") {
    return ["Kalıp yönü yalnız kullanıcının alışılmış bedenine dayanan düşük güvenli bir tahmindir.", common];
  }
  if (basis === "size-not-listed") {
    return ["Seçilen beden ürünün doğrulanmış beden listesinde bulunmadığı için kalıp sinyali üretilmedi.", common];
  }
  return ["Kalıp yönü için yeterli ve karşılaştırılabilir ölçü verisi bulunmuyor.", common];
}

/**
 * Produces bounded, categorical rendering guidance for one selected catalog
 * size. It never returns raw body measurements or invents garment dimensions.
 */
export function createFitRenderSpec(
  profile: FitRenderProfile,
  product: FitRenderProduct,
  selectedSize: string,
): FitRenderSpec {
  const recommendation = getFitRecommendation(profile, product);
  const garmentType = resolveGarmentType(product);
  const kind = guideKind(product);
  const sizes = orderedSizes(product);
  const normalizedSelectedSize = normalizeSize(selectedSize);
  const selectedIndex = sizes.findIndex((size) => normalizeSize(size) === normalizedSelectedSize);
  const selectedListed = selectedIndex >= 0;
  const selectedLabel = selectedListed ? sizes[selectedIndex] : selectedSize.trim();
  const recommendedIndex = recommendation.recommendedSize
    ? sizes.findIndex((size) => normalizeSize(size) === normalizeSize(recommendation.recommendedSize ?? ""))
    : -1;
  const selectedSizeOffset = selectedListed && recommendedIndex >= 0
    ? selectedIndex - recommendedIndex
    : null;
  const selectedRow = kind === "body"
    ? product.sizeGuide.find((row) => normalizeSize(row.size) === normalizedSelectedSize)
    : undefined;
  const dimensions = kind === "body"
    ? normalizedDimensionDeltas(profile, product, selectedRow, garmentType)
    : [];
  const weights = RELEVANCE_WEIGHTS[garmentType];
  const relevantWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const usedWeight = dimensions.reduce((sum, dimension) => sum + dimension.relevanceWeight, 0);
  const coverage = relevantWeight > 0 ? round(clamp(usedWeight / relevantWeight, 0, 1)) : 0;
  const hasComparableButUngradedDimension = kind === "body" && Boolean(selectedRow) && DIMENSIONS.some(({ profileKey }) => (
    weights[profileKey] > 0
    && finitePositive(profile[profileKey])
    && finitePositive(selectedRow?.[profileKey])
    && !observedGuideStep(product.sizeGuide, profileKey)
  ));
  const basis = evidenceBasis({
    selectedListed,
    kind,
    dimensions,
    hasComparableButUngradedDimension,
    hasUsualSizeEvidence: hasUsualSizeEvidence(profile, garmentType, sizes),
  });
  const assessment = recommendation.assessments.find(
    (item) => normalizeSize(item.size) === normalizedSelectedSize,
  );
  const trustworthyAssessment = selectedListed && basisSupportsFitIntent(basis);
  const fitIntent = trustworthyAssessment ? (assessment?.fitIntent ?? "unknown") : "unknown";
  const confidence = selectedListed ? confidenceForSpec(basis, recommendation.confidence) : "none";
  const trustedSizeOffset = trustworthyAssessment ? selectedSizeOffset : null;
  const trustedRecommendation = trustworthyAssessment ? recommendation.recommendedSize : null;

  return {
    version: 1,
    selectedSize: selectedLabel,
    garmentType,
    sizeGuideKind: kind,
    declaredProductFit: product.fit.trim() || null,
    recommendedSize: trustedRecommendation,
    selectedSizeOffset: trustedSizeOffset,
    fitIntent,
    confidence,
    evidence: {
      basis,
      coverage,
      dimensions,
      normalizedBodyDelta: compositeDelta(dimensions),
      targetIsBodyMeasurement: kind === "body",
      garmentEaseKnown: false,
    },
    renderCues: renderCues(fitIntent, trustedSizeOffset),
    caveats: caveatsFor(basis),
  };
}
