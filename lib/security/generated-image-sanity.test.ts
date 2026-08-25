import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectGeneratedImage } from "@/lib/security/generated-image-sanity";

async function jpegFromRgb(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number],
) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const [red, green, blue] = pixel(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
    }
  }

  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

describe("generated image sanity inspection", () => {
  it("flags an all-black JPEG", async () => {
    const bytes = await jpegFromRgb(320, 480, () => [0, 0, 0]);

    await expect(inspectGeneratedImage(bytes)).resolves.toEqual({
      width: 320,
      height: 480,
      almostEntirelyBlack: true,
    });
  });

  it("does not flag a dark garment on a light background", async () => {
    const width = 320;
    const height = 480;
    const bytes = await jpegFromRgb(width, height, (x, y) => {
      const insideGarment = x >= 90 && x < 230 && y >= 90 && y < 390;
      return insideGarment ? [4, 5, 7] : [242, 239, 232];
    });

    await expect(inspectGeneratedImage(bytes)).resolves.toMatchObject({
      width,
      height,
      almostEntirelyBlack: false,
    });
  });

  it("does not flag a normally colored image", async () => {
    const width = 300;
    const height = 420;
    const bytes = await jpegFromRgb(width, height, (x, y) => [
      40 + Math.round((x / width) * 170),
      35 + Math.round((y / height) * 180),
      150,
    ]);

    await expect(inspectGeneratedImage(bytes)).resolves.toMatchObject({
      width,
      height,
      almostEntirelyBlack: false,
    });
  });

  it("throws when the input cannot be decoded as an image", async () => {
    await expect(inspectGeneratedImage(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});
