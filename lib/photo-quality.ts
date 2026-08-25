import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES, validatePhoto } from "@/lib/validation";

export type PhotoKind = "person" | "garment";
export type AcceptedPhotoType = (typeof ACCEPTED_PHOTO_TYPES)[number];

export type ImageDimensions = {
  width: number;
  height: number;
};

export type PhotoQualityLevel = "ready" | "warning" | "error";

export type PhotoFileLike = Pick<File, "name" | "size" | "type">;

export type PhotoInspection = {
  contentType?: AcceptedPhotoType;
  dimensions?: ImageDimensions;
  inspectionError?: string;
};

export type PhotoQualityReport = {
  accepted: boolean;
  kind: PhotoKind;
  level: PhotoQualityLevel;
  contentType: AcceptedPhotoType | null;
  dimensions: ImageDimensions | null;
  errors: string[];
  warnings: string[];
  guidance: string[];
};

const MAX_HEADER_BYTES = 256 * 1024;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_IMAGE_PIXELS = 32_000_000;
const MINIMUM_SHORT_EDGE = 320;
const RECOMMENDED_SHORT_EDGE: Record<PhotoKind, number> = {
  person: 960,
  garment: 768,
};

function isAcceptedPhotoType(value: string): value is AcceptedPhotoType {
  return ACCEPTED_PHOTO_TYPES.includes(value as AcceptedPhotoType);
}

function isPositiveDimension(dimensions: ImageDimensions): boolean {
  return Number.isInteger(dimensions.width) && Number.isInteger(dimensions.height) && dimensions.width > 0 && dimensions.height > 0;
}

function readUInt16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 1 >= bytes.length) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt24LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 >= bytes.length) return null;
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 >= bytes.length) return null;
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] * 0x1000000)) >>> 0;
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    const segmentLength = readUInt16BE(bytes, offset);
    if (!segmentLength || segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      const height = readUInt16BE(bytes, offset + 3);
      const width = readUInt16BE(bytes, offset + 5);
      if (!height || !width) return null;
      return { width, height };
    }

    offset += segmentLength;
  }

  return null;
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
}

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  return text.split("").every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!hasAscii(bytes, 0, "RIFF") || !hasAscii(bytes, 8, "WEBP")) return null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUInt32LE(bytes, offset + 4);
    if (chunkSize === null) return null;
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkSize;
    if (chunkEnd > bytes.length) return null;

    if (hasAscii(bytes, offset, "VP8X") && chunkSize >= 10) {
      const widthMinusOne = readUInt24LE(bytes, chunkDataOffset + 4);
      const heightMinusOne = readUInt24LE(bytes, chunkDataOffset + 7);
      if (widthMinusOne === null || heightMinusOne === null) return null;
      return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
    }

    if (hasAscii(bytes, offset, "VP8 ") && chunkSize >= 10) {
      if (bytes[chunkDataOffset + 3] !== 0x9d || bytes[chunkDataOffset + 4] !== 0x01 || bytes[chunkDataOffset + 5] !== 0x2a) return null;
      const rawWidth = readUInt16BE(bytes, chunkDataOffset + 6);
      const rawHeight = readUInt16BE(bytes, chunkDataOffset + 8);
      if (rawWidth === null || rawHeight === null) return null;
      return { width: rawWidth & 0x3fff, height: rawHeight & 0x3fff };
    }

    if (hasAscii(bytes, offset, "VP8L") && chunkSize >= 5 && bytes[chunkDataOffset] === 0x2f) {
      const first = bytes[chunkDataOffset + 1];
      const second = bytes[chunkDataOffset + 2];
      const third = bytes[chunkDataOffset + 3];
      const fourth = bytes[chunkDataOffset + 4];
      return {
        width: 1 + first + ((second & 0x3f) << 8),
        height: 1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
      };
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  return null;
}

/**
 * Reads only image headers. This gives the UI a cheap preflight check before a
 * browser attempts to decode a potentially oversized image.
 */
export function inspectImageHeader(bytes: Uint8Array): PhotoInspection {
  const png = pngDimensions(bytes);
  if (png) return { contentType: "image/png", dimensions: png };

  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { contentType: "image/jpeg", dimensions: jpeg };

  const webp = webpDimensions(bytes);
  if (webp) return { contentType: "image/webp", dimensions: webp };

  return { inspectionError: "Dosya geçerli bir JPG, PNG veya WebP görseli olarak okunamadı." };
}

function baseGuidance(kind: PhotoKind): string[] {
  if (kind === "person") {
    return ["Başından ayak ucuna kadar tek kişinin göründüğü, karşıdan ve iyi aydınlatılmış bir fotoğraf kullan."];
  }
  return ["Tek ürünü mümkün olduğunca ortalayarak, temiz ve kontrastı yüksek bir arka planda çek."];
}

/**
 * Produces deterministic, testable guidance from already-known file metadata.
 * It intentionally does not claim to assess focus, lighting, body visibility,
 * or garment identity: those require an image/vision model.
 */
export function assessPhotoMetadata(
  file: PhotoFileLike,
  kind: PhotoKind,
  inspection: PhotoInspection = {},
): PhotoQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileError = validatePhoto(file as File);
  const dimensions = inspection.dimensions && isPositiveDimension(inspection.dimensions) ? inspection.dimensions : null;
  const contentType = inspection.contentType ?? null;

  if (fileError) {
    errors.push(fileError);
  } else if (inspection.inspectionError) {
    errors.push(inspection.inspectionError);
  } else if (!contentType || !dimensions) {
    errors.push("Görselin biçimi veya çözünürlüğü okunamadı. Başka bir JPG, PNG veya WebP seç.");
  } else if (contentType !== file.type) {
    errors.push("Dosyanın bildirilen biçimi ile gerçek görsel biçimi eşleşmiyor. Dosyayı yeniden dışa aktarıp tekrar dene.");
  }

  if (dimensions && errors.length === 0) {
    const shortEdge = Math.min(dimensions.width, dimensions.height);
    const longEdge = Math.max(dimensions.width, dimensions.height);
    const pixels = dimensions.width * dimensions.height;
    const aspectRatio = longEdge / shortEdge;

    if (shortEdge < MINIMUM_SHORT_EDGE) {
      errors.push(`Fotoğrafın kısa kenarı en az ${MINIMUM_SHORT_EDGE} px olmalı. Daha yüksek çözünürlüklü bir görsel seç.`);
    }
    if (longEdge > MAX_IMAGE_DIMENSION || pixels > MAX_IMAGE_PIXELS) {
      errors.push(`Fotoğraf çok büyük (${dimensions.width} × ${dimensions.height} px). En fazla ${MAX_IMAGE_DIMENSION} px kenar ve ${MAX_IMAGE_PIXELS / 1_000_000} MP kullan.`);
    }

    if (errors.length === 0 && shortEdge < RECOMMENDED_SHORT_EDGE[kind]) {
      warnings.push(`Çözünürlük düşük olabilir (${dimensions.width} × ${dimensions.height} px). Daha net sonuç için kısa kenarı en az ${RECOMMENDED_SHORT_EDGE[kind]} px olan bir görsel önerilir.`);
    }
    if (errors.length === 0 && file.size < 200 * 1024) {
      warnings.push("Dosya boyutu oldukça küçük; fazla sıkıştırılmış bir fotoğraf ayrıntıları azaltabilir.");
    }
    if (errors.length === 0 && kind === "person" && dimensions.height / dimensions.width < 1.1) {
      warnings.push("Dikey, tam boy bir fotoğraf sanal prova için daha güvenilir sonuç verir.");
    }
    if (errors.length === 0 && kind === "person" && aspectRatio > 3.2) {
      warnings.push("Fotoğraf çok dar veya uzun görünüyor; kişiyi daha dengeli kadrajlayan bir fotoğraf önerilir.");
    }
    if (errors.length === 0 && kind === "garment" && aspectRatio > 2.2) {
      warnings.push("Kıyafet görselini tek ürüne daha sıkı kadrajlamak, arka plan etkisini azaltır.");
    }
  }

  const level: PhotoQualityLevel = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready";
  return {
    accepted: errors.length === 0,
    kind,
    level,
    contentType: isAcceptedPhotoType(contentType ?? "") ? contentType : null,
    dimensions,
    errors,
    warnings,
    guidance: baseGuidance(kind),
  };
}

async function decodedImageDimensions(file: File): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<ImageDimensions>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Görsel tarayıcı tarafından açılamadı."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Browser-only photo preflight. The final server-side magic-byte and upload
 * validation remains authoritative; this prevents poor or unsafe selections
 * from reaching that step in normal UI use.
 */
export async function analyzePhotoFile(file: File, kind: PhotoKind): Promise<PhotoQualityReport> {
  const basicReport = assessPhotoMetadata(file, kind);
  if (!basicReport.accepted && !isAcceptedPhotoType(file.type)) return basicReport;
  if (file.size > MAX_PHOTO_BYTES) return basicReport;

  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, MAX_HEADER_BYTES).arrayBuffer());
  } catch {
    return assessPhotoMetadata(file, kind, {
      inspectionError: "Fotoğraf dosyası okunamadı. Başka bir dosya seçip tekrar dene.",
    });
  }

  const headerInspection = inspectImageHeader(header);
  let report = assessPhotoMetadata(file, kind, headerInspection);
  if (!report.accepted || !report.dimensions) return report;

  // The header guard runs before decoding, so huge compressed images are never
  // decoded solely for quality guidance. A real browser decode catches corrupt
  // files which happen to have a valid-looking signature/header.
  try {
    const decoded = await decodedImageDimensions(file);
    if (decoded && isPositiveDimension(decoded)) {
      report = assessPhotoMetadata(file, kind, { ...headerInspection, dimensions: decoded });
    }
  } catch {
    return assessPhotoMetadata(file, kind, {
      ...headerInspection,
      inspectionError: "Görsel tarayıcı tarafından açılamadı. Bozulmamış bir JPG, PNG veya WebP seç.",
    });
  }

  return report;
}

export function formatPhotoMetadata(report: PhotoQualityReport): string {
  const format = report.contentType === "image/jpeg" ? "JPG" : report.contentType === "image/png" ? "PNG" : report.contentType === "image/webp" ? "WebP" : "Görsel";
  if (!report.dimensions) return format;
  return `${format} · ${report.dimensions.width} × ${report.dimensions.height} px`;
}
