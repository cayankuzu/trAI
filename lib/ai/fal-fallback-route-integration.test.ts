import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadIntentRoute = readFileSync(
  new URL("../../app/api/try-ons/upload-intent/route.ts", import.meta.url),
  "utf8",
);
const tryOnRoute = readFileSync(
  new URL("../../app/api/try-ons/route.ts", import.meta.url),
  "utf8",
);

describe("explicit Fal safety fallback route wiring", () => {
  it("keeps providerMode optional, strict and allowlisted while storing the chosen endpoint", () => {
    expect(uploadIntentRoute).toContain('providerMode: z.enum(["primary", "safety_fallback", "garment_fidelity", "fit_aware"]).optional()');
    expect(uploadIntentRoute).toContain("}).strict().superRefine");
    expect(uploadIntentRoute).toContain("falTryOnEndpointForMode(input.providerMode)");
    expect(uploadIntentRoute).toContain('code: "garment_fidelity_single_size"');
    expect(uploadIntentRoute).toContain('tryOnRenderModeForEndpoint(providerEndpoint) === "garment-fidelity"');
    expect(uploadIntentRoute).toContain("p_provider_models: input.variants.map(() => providerEndpoint)");
  });

  it("uses only the stored allowlisted endpoint and maps the product category", () => {
    expect(tryOnRoute).toContain("isFalTryOnEndpoint(providerEndpoint)");
    expect(tryOnRoute).toContain("endpoint: providerEndpoint");
    expect(tryOnRoute).toContain("garmentCategory: fashnCategoryForProduct(product.categoryKey)");
    expect(tryOnRoute).toContain("garmentPhotoType = garmentImage.garmentPhotoType");
    expect(tryOnRoute).toContain("garmentPhotoType,");
    expect(tryOnRoute).toContain("createFitRenderSpec(");
    expect(tryOnRoute).toContain("seed: stableTryOnSeed(input.sessionId, selectedView)");
    expect(tryOnRoute).toContain("renderSpec: fitRenderSpec");
  });

  it("preserves the read-only result refresh handler", () => {
    expect(tryOnRoute).toContain("export async function GET(request: NextRequest)");
    expect(tryOnRoute).toContain("This endpoint is deliberately read-only");
  });

  it("treats an unlabelled black frame as invalid output, not proof of a safety decision", () => {
    expect(tryOnRoute).toMatch(
      /if \(inspection\.almostEntirelyBlack\) \{[\s\S]{0,220}"provider_output"/,
    );
  });
});
