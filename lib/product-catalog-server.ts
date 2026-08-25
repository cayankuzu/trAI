import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getCatalogProduct } from "@/lib/product-catalog";
import type { TryOnView } from "@/lib/types";
import {
  detectImageType,
  downloadExternalImage,
  type SafeImage,
} from "@/lib/security/external-images";

const MAX_CATALOG_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_IMAGE_PIXELS = 20_000_000;
const PROVIDER_GARMENT_EDGE = 1024;
const PROVIDER_GARMENT_MARGIN = 40;
const PROVIDER_GARMENT_CONTENT_EDGE = PROVIDER_GARMENT_EDGE - (PROVIDER_GARMENT_MARGIN * 2);
const FLAT_LAY_BACKGROUND = { r: 247, g: 247, b: 248, alpha: 1 } as const;
const highResolutionGarmentCache = new Map<string, Promise<SafeImage>>();
const preparedGarmentCache = new Map<string, Promise<PreparedCatalogGarmentImage>>();

export type PreparedCatalogGarmentImage = SafeImage & {
  garmentPhotoType: "auto" | "model" | "flat-lay";
};

export class CatalogProductError extends Error {
  readonly code = "catalog_product_invalid";

  constructor(message: string) {
    super(message);
    this.name = "CatalogProductError";
  }
}

async function prepareFlatLayForProvider(bytes: Uint8Array): Promise<SafeImage> {
  let output: Buffer;
  try {
    output = await sharp(Buffer.from(bytes), {
      failOn: "warning",
      limitInputPixels: MAX_CATALOG_IMAGE_PIXELS,
      sequentialRead: true,
    })
      .autoOrient()
      // The catalog master stays unchanged. Only the short-lived provider copy
      // loses empty page whitespace so the existing print/texture receives far
      // more input pixels without a generative upscale or JPEG recompression.
      .trim({ threshold: 12 })
      .extend({
        top: PROVIDER_GARMENT_MARGIN,
        right: PROVIDER_GARMENT_MARGIN,
        bottom: PROVIDER_GARMENT_MARGIN,
        left: PROVIDER_GARMENT_MARGIN,
        background: FLAT_LAY_BACKGROUND,
      })
      .resize({
        width: PROVIDER_GARMENT_CONTENT_EDGE,
        height: PROVIDER_GARMENT_CONTENT_EDGE,
        fit: "contain",
        background: FLAT_LAY_BACKGROUND,
        kernel: sharp.kernel.lanczos3,
      })
      .flatten({ background: FLAT_LAY_BACKGROUND })
      .toColourspace("srgb")
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer();
  } catch {
    throw new CatalogProductError("Katalog ürününün yüksek sadakatli prova görseli hazırlanamadı.");
  }

  if (output.byteLength > MAX_CATALOG_IMAGE_BYTES) {
    throw new CatalogProductError("Hazırlanan katalog ürünü görseli 10 MB sınırını aşıyor.");
  }
  return {
    bytes: new Uint8Array(output),
    contentType: "image/png",
    extension: "png",
  };
}

async function assertCatalogImageDecodes(bytes: Uint8Array) {
  try {
    const image = sharp(Buffer.from(bytes), {
      failOn: "warning",
      limitInputPixels: MAX_CATALOG_IMAGE_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const width = metadata.autoOrient.width;
    const height = metadata.autoOrient.height;
    if (!width || !height) throw new Error("missing dimensions");
    await image
      .clone()
      .autoOrient()
      .resize({ width: 1, height: 1, fit: "fill" })
      .toColourspace("srgb")
      .raw()
      .toBuffer();
  } catch {
    throw new CatalogProductError("Katalog ürünü görseli güvenli biçimde çözümlenemedi.");
  }
}

async function readHighResolutionGarment(url: string) {
  let pending = highResolutionGarmentCache.get(url);
  if (!pending) {
    pending = downloadExternalImage(url);
    highResolutionGarmentCache.set(url, pending);
  }
  try {
    return await pending;
  } catch {
    // A transient retailer-CDN failure must not block a try-on. Do not cache the
    // rejection; a later request can retry while this request uses the local master.
    highResolutionGarmentCache.delete(url);
    return null;
  }
}

async function prepareCatalogGarmentImage(
  productId: string,
  view: TryOnView = "front",
  options: { preferHighResolution?: boolean } = {},
): Promise<PreparedCatalogGarmentImage> {
  const product = getCatalogProduct(productId);
  if (!product) throw new CatalogProductError("Seçilen katalog ürünü bulunamadı.");

  const publicRoot = path.resolve(process.cwd(), "public");
  const configuredPath = product.garmentImages[view];
  if (!configuredPath) throw new CatalogProductError("Bu ürün için arka görünüm görseli bulunamadı.");
  const relativePath = configuredPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const relativeToPublic = path.relative(publicRoot, absolutePath);
  if (relativeToPublic.startsWith("..") || path.isAbsolute(relativeToPublic)) {
    throw new CatalogProductError("Katalog ürünü görsel yolu geçersiz.");
  }

  let file: Buffer;
  try {
    file = await readFile(absolutePath);
  } catch {
    throw new CatalogProductError("Katalog ürünü görseli sunucuda bulunamadı.");
  }
  if (file.byteLength > MAX_CATALOG_IMAGE_BYTES) {
    throw new CatalogProductError("Katalog ürünü görseli 10 MB sınırını aşıyor.");
  }

  let bytes: SafeImage["bytes"] = new Uint8Array(file);
  let garmentPhotoType = product.renderingProfile.garmentPhotoType;
  const highResolutionUrl = product.providerGarmentImages?.[view];
  if (options.preferHighResolution !== false && highResolutionUrl) {
    const highResolutionImage = await readHighResolutionGarment(highResolutionUrl);
    if (highResolutionImage) {
      bytes = highResolutionImage.bytes;
      garmentPhotoType = product.providerGarmentPhotoTypes?.[view] ?? garmentPhotoType;
    }
  }
  const detected = detectImageType(bytes);
  if (!detected) throw new CatalogProductError("Katalog ürünü görsel formatı geçersiz.");
  if (garmentPhotoType === "flat-lay") {
    return { ...await prepareFlatLayForProvider(bytes), garmentPhotoType };
  }
  await assertCatalogImageDecodes(bytes);
  return { bytes, ...detected, garmentPhotoType };
}

export async function readCatalogGarmentImage(
  productId: string,
  view: TryOnView = "front",
  options: { preferHighResolution?: boolean } = {},
): Promise<PreparedCatalogGarmentImage> {
  const key = `${productId}:${view}:${options.preferHighResolution === false ? "local" : "high-res"}`;
  let pending = preparedGarmentCache.get(key);
  if (!pending) {
    pending = prepareCatalogGarmentImage(productId, view, options);
    preparedGarmentCache.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    preparedGarmentCache.delete(key);
    throw error;
  }
}
