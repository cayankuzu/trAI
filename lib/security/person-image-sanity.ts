import "server-only";

import { inspectGeneratedImage } from "./generated-image-sanity";

export const MAX_PERSON_IMAGE_DIMENSION = 8_192;
export const MAX_PERSON_IMAGE_PIXELS = 32_000_000;
export const MIN_PERSON_IMAGE_EDGE = 320;

export type PersonImageInspection = Awaited<ReturnType<typeof inspectGeneratedImage>> & {
  acceptable: boolean;
};

/**
 * Re-decodes the private upload on the server before a paid provider request.
 * Client-side metadata checks improve UX but are not a security boundary.
 */
export async function inspectPersonImage(bytes: Uint8Array): Promise<PersonImageInspection> {
  const inspection = await inspectGeneratedImage(bytes);
  const shortEdge = Math.min(inspection.width, inspection.height);
  const longEdge = Math.max(inspection.width, inspection.height);
  return {
    ...inspection,
    acceptable:
      shortEdge >= MIN_PERSON_IMAGE_EDGE
      && longEdge <= MAX_PERSON_IMAGE_DIMENSION
      && inspection.width * inspection.height <= MAX_PERSON_IMAGE_PIXELS
      && !inspection.almostEntirelyBlack,
  };
}
