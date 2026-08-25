import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectPersonImage } from "./person-image-sanity";

async function solidJpeg(width: number, height: number, background = { r: 120, g: 90, b: 70 }) {
  return sharp({
    create: { width, height, channels: 3, background },
  }).jpeg({ quality: 90 }).toBuffer();
}

describe("server-side person image sanity", () => {
  it("accepts a visible portrait inside the bounded dimensions", async () => {
    const bytes = await solidJpeg(640, 960);
    await expect(inspectPersonImage(bytes)).resolves.toMatchObject({
      width: 640,
      height: 960,
      acceptable: true,
    });
  });

  it("rejects undersized, overlong and black provider inputs", async () => {
    const [small, overlong, black] = await Promise.all([
      inspectPersonImage(await solidJpeg(319, 480)),
      inspectPersonImage(await solidJpeg(8_193, 320)),
      inspectPersonImage(await solidJpeg(320, 480, { r: 0, g: 0, b: 0 })),
    ]);
    expect(small.acceptable).toBe(false);
    expect(overlong.acceptable).toBe(false);
    expect(black.acceptable).toBe(false);
  });

  it("rejects bytes that are not a decodable image", async () => {
    await expect(inspectPersonImage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
