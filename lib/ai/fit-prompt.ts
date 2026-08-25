import "server-only";

import type { FitRenderSpec } from "@/lib/fit-render-spec";

export type TryOnView = "front" | "back";
export type FitIntent = "fitted" | "regular" | "relaxed";

export type FitPromptInput = {
  productTitle: string;
  category: string;
  selectedSize: string;
  view: TryOnView;
  fitIntent: FitIntent;
  color?: string;
  material?: string;
  declaredFit?: string;
  visualDescription?: string;
  renderSpec?: FitRenderSpec;
};

export const DEFAULT_FIT_PROMPT = [
  "Create a high-fidelity photorealistic virtual try-on using only the supplied person and garment images.",
  "Preserve the person's identity, natural body shape, proportions, pose, camera angle, lighting, and background.",
  "Treat the garment image as the source of truth and preserve its construction, color, material, neckline, sleeves, hem, logos, artwork, print placement, and other visible details.",
  "Keep the fit natural and do not reshape the person's body.",
  "Do not add labels, size marks, measurements, personal data, or new text to the image.",
].join(" ");

const FIT_INSTRUCTIONS: Record<FitIntent, string> = {
  fitted: "Render relatively less visible ease than the recommended size, with plausible tension and fold placement, while retaining the garment's declared design silhouette and without reshaping the person.",
  regular: "Render the garment's declared design silhouette with balanced ease, realistic clearance, and natural drape.",
  relaxed: "Render relatively more visible ease than the recommended size, with realistic clearance and natural drape, while retaining the garment's declared design silhouette and without reshaping the person.",
};

const VIEW_INSTRUCTIONS: Record<TryOnView, string> = {
  front: "Keep the front-facing view of the supplied person photo and show the front of the garment; do not rotate the person.",
  back: "Keep the rear-facing view of the supplied person photo and show the back of the garment; do not rotate the person or invent a face.",
};

function safeCatalogLabel(value: string, fallback: string, maximumLength: number) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}\s&'().,/+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength)
    .trim();

  return normalized || fallback;
}

function optionalCatalogLabel(value: string | undefined, maximumLength: number) {
  if (!value?.trim()) return null;
  return safeCatalogLabel(value, "", maximumLength) || null;
}

function adjustmentInstruction(spec: FitRenderSpec | undefined) {
  if (!spec || spec.renderCues.adjustmentStrength === "none") {
    return "Preserve the product's declared cut and show balanced, natural ease.";
  }
  const strength = spec.renderCues.adjustmentStrength === "moderate" ? "clearly but plausibly" : "subtly";
  if (spec.renderCues.sizeAdjustment === "reduce-visible-ease") {
    return `${strength} reduce only the garment's visible ease and clearance; keep its construction, print scale, hem length, and the person's body unchanged.`;
  }
  if (spec.renderCues.sizeAdjustment === "increase-visible-ease") {
    return `${strength} increase only the garment's visible ease, volume, and natural folds; keep its construction, print scale, and the person's body unchanged.`;
  }
  return "Preserve the product's declared cut and show balanced, natural ease.";
}

/**
 * Builds a provider instruction from catalog metadata and categorical fit
 * intent only. Raw body measurements are deliberately not accepted here.
 */
export function buildFitPrompt(input: FitPromptInput) {
  const productTitle = safeCatalogLabel(input.productTitle, "catalog garment", 100);
  const category = safeCatalogLabel(input.category, "garment", 60);
  const selectedSize = safeCatalogLabel(input.selectedSize, "selected catalog size", 20);
  const color = optionalCatalogLabel(input.color, 40);
  const material = optionalCatalogLabel(input.material, 80);
  const declaredFit = optionalCatalogLabel(input.declaredFit, 60);
  const visualDescription = optionalCatalogLabel(input.visualDescription, 220);
  const attributes = [
    color ? `color: ${color}` : null,
    material ? `material: ${material}` : null,
    declaredFit ? `declared cut: ${declaredFit}` : null,
  ].filter(Boolean).join("; ");

  return [
    "Create a high-fidelity photorealistic virtual try-on using only the supplied person and garment images.",
    `Garment reference: ${productTitle}; category: ${category}; selected catalog size: ${selectedSize}.`,
    attributes ? `Verified catalog attributes: ${attributes}.` : "",
    visualDescription ? `Visible garment details: ${visualDescription}.` : "",
    VIEW_INSTRUCTIONS[input.view],
    FIT_INSTRUCTIONS[input.fitIntent],
    adjustmentInstruction(input.renderSpec),
    "Keep the person's body, identity, proportions, pose, hands, face, hair, camera, crop, lighting, and background exactly unchanged between size variants.",
    "Change only garment ease, clearance, folds, seam placement, and drape when expressing the selected size.",
    "Preserve the person's identity, natural body shape, proportions, pose, camera angle, lighting, and background.",
    "Treat the supplied garment image as the sole visual source of truth. Reproduce its exact construction, neckline, sleeves, hem, color, material texture, seams, logos, artwork, typography, print scale, and print placement; do not redesign or simplify it.",
    "The selected size is a bounded visual fit cue, not a request to alter the person's body.",
    "Do not add labels, size marks, measurements, watermarks, or new text; preserve only text already printed on the garment.",
    "Return one clean, realistic fashion photograph without a collage, border, caption, or before-after layout.",
  ].filter(Boolean).join(" ");
}
