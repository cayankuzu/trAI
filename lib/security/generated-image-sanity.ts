import "server-only";

import sharp from "sharp";

export type GeneratedImageInspection = {
  width: number;
  height: number;
  almostEntirelyBlack: boolean;
};

const MAX_INPUT_PIXELS = 40_000_000;
const INSPECTION_EDGE = 256;
const BLACK_CHANNEL_MAX = 8;
const BLACK_PIXEL_RATIO = 0.995;
const MAX_MEAN_LUMA = 4;

/**
 * Decodes a generated image and samples a bounded, orientation-aware sRGB
 * thumbnail. Transparency is composited over white to match the light result
 * surface and avoid treating transparent pixels as black content.
 */
export async function inspectGeneratedImage(bytes: Uint8Array): Promise<GeneratedImageInspection> {
  const input = Buffer.from(bytes);
  const image = sharp(input, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  });
  const metadata = await image.metadata();
  const width = metadata.autoOrient.width;
  const height = metadata.autoOrient.height;

  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error("Generated image dimensions are invalid.");
  }

  const { data, info } = await image
    .clone()
    .autoOrient()
    .resize({
      width: INSPECTION_EDGE,
      height: INSPECTION_EDGE,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.nearest,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3 || info.width < 1 || info.height < 1) {
    throw new Error("Generated image pixels could not be inspected.");
  }

  const pixelCount = info.width * info.height;
  let blackPixels = 0;
  let lumaTotal = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * info.channels;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;

    if (Math.max(red, green, blue) <= BLACK_CHANNEL_MAX) blackPixels += 1;
    lumaTotal += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  }

  return {
    width,
    height,
    almostEntirelyBlack:
      blackPixels / pixelCount >= BLACK_PIXEL_RATIO
      && lumaTotal / pixelCount <= MAX_MEAN_LUMA,
  };
}
