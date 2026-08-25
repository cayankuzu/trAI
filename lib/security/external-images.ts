import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DNS_LOOKUP_TIMEOUT_MS = 2_500;

type DnsAddress = { address: string; family: number };
type DnsLookup = (hostname: string) => Promise<DnsAddress[]>;

export class ExternalImageError extends Error {
  constructor(
    public readonly code: "unsafe_url" | "page_unavailable" | "image_missing" | "invalid_image" | "image_too_large",
    message: string,
  ) {
    super(message);
    this.name = "ExternalImageError";
  }
}

export type SafeImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

export type ProductMeta = {
  title?: string;
  description?: string;
  brand?: string;
  price?: string;
  currency?: string;
  color?: string;
  material?: string;
  gender?: string;
  availability?: string;
  sizes?: string[];
  imageUrl?: string;
};

export function matchesStorageImageExtension(
  path: string,
  extension: SafeImage["extension"],
) {
  const pathExtension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return pathExtension === extension;
}

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPublicIpAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return false;
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  return true;
}

export async function lookupAddressesWithTimeout(
  hostname: string,
  timeoutMs = DNS_LOOKUP_TIMEOUT_MS,
  resolve: DnsLookup = (value) => lookup(value, { all: true, verbatim: true }),
) {
  return new Promise<DnsAddress[]>((finish) => {
    let settled = false;
    const complete = (addresses: DnsAddress[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish(addresses);
    };
    const timer = setTimeout(() => complete([]), timeoutMs);
    resolve(hostname).then(complete, () => complete([]));
  });
}

async function assertSafeHttpsUrl(value: string, base?: URL) {
  let url: URL;
  try {
    url = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new ExternalImageError("unsafe_url", "Güvenli bir HTTPS adresi kullan.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ExternalImageError("unsafe_url", "Güvenli bir HTTPS adresi kullan.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new ExternalImageError("unsafe_url", "Yerel ağ adresleri kullanılamaz.");
  }

  const literalVersion = isIP(hostname);
  const addresses = literalVersion
    ? [{ address: hostname }]
    : await lookupAddressesWithTimeout(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new ExternalImageError("unsafe_url", "Bağlantı güvenli biçimde doğrulanamadı.");
  }

  url.hash = "";
  return url;
}

async function fetchWithSafeRedirects(initialUrl: string, accept: string, timeoutMs = 10_000) {
  let url = await assertSafeHttpsUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: accept,
        "User-Agent": "trAI-MVP/1.0 (+https://trai.app)",
      },
      cache: "no-store",
    }).catch(() => {
      throw new ExternalImageError("page_unavailable", "Ürün bağlantısına ulaşılamadı.");
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new ExternalImageError("page_unavailable", "Ürün bağlantısı çok fazla yönlendirme içeriyor.");
      }
      url = await assertSafeHttpsUrl(location, url);
      continue;
    }

    if (!response.ok) {
      throw new ExternalImageError("page_unavailable", "Ürün bağlantısı okunamadı.");
    }

    return { response, finalUrl: url };
  }

  throw new ExternalImageError("page_unavailable", "Ürün bağlantısı okunamadı.");
}

async function readLimitedBytes(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new ExternalImageError("image_too_large", "Görsel en fazla 10 MB olabilir.");
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ExternalImageError("image_too_large", "Görsel en fazla 10 MB olabilir.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function detectImageType(bytes: Uint8Array): Pick<SafeImage, "contentType" | "extension"> | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

function decodeHtmlAttribute(value: string) {
  const decodeCodePoint = (raw: string, radix: number) => {
    const codePoint = Number.parseInt(raw, radix);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : "";
  };

  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => decodeCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => decodeCodePoint(code, 16));
}

function splitDelimitedValues(value: string) {
  return value
    .split(/[,\n;/|]/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function addUniqueValues(target: Set<string>, values: string[]) {
  for (const value of values) {
    if (value.length === 0) continue;
    target.add(value.toUpperCase().startsWith("EUR") || value.includes("-") || /^\w/.test(value) ? value : value.toUpperCase());
  }
}

function normalizeProductMetaValue(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeProductMetaPrice(price: string | null | undefined, currency: string | null | undefined) {
  const normalizedPrice = normalizeProductMetaValue(price);
  const normalizedCurrency = normalizeProductMetaValue(currency);
  if (!normalizedPrice && !normalizedCurrency) return undefined;
  return normalizedCurrency ? `${normalizedPrice || "N/A"} ${normalizedCurrency}` : normalizedPrice;
}

function collectSizesFromValue(target: Set<string>, value: unknown) {
  if (typeof value === "string") {
    for (const candidate of splitDelimitedValues(value)) {
      addUniqueValues(target, [candidate]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectSizesFromValue(target, item);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [, nestedValue] of Object.entries(value)) {
      collectSizesFromValue(target, nestedValue);
    }
  }
}

function extractProductMetadataFromHtml(html: string, pageUrl: URL) {
  const meta = new Map<string, string>();

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (content) {
      meta.set(key, content);
    }
  }

  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTagMatch?.[1]) {
    meta.set("title", decodeHtmlAttribute(titleTagMatch[1].trim()));
  }

  const result: ProductMeta = {
    title: meta.get("og:title") ?? meta.get("twitter:title") ?? meta.get("title"),
    description: meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description"),
    brand: meta.get("product:brand") ?? meta.get("og:site_name"),
    price: meta.get("product:price:amount"),
    currency: meta.get("product:price:currency"),
    color: meta.get("product:color") ?? meta.get("color"),
    material: meta.get("product:material"),
    gender: meta.get("product:gender"),
    availability: meta.get("product:availability"),
  };

  const sizeSet = new Set<string>();
  for (const [rawKey, rawValue] of meta.entries()) {
    const key = rawKey.toLowerCase();
    if (key.includes("size")) {
      collectSizesFromValue(sizeSet, rawValue);
    }
  }
  if (sizeSet.size > 0) {
    result.sizes = Array.from(sizeSet);
  }

  const imageCandidate = extractProductImageUrl(html, pageUrl);
  if (imageCandidate) {
    result.imageUrl = imageCandidate;
  }

  return result;
}

function safeSizeText(value: string) {
  return value ? value.trim().replace(/\s{2,}/g, " ") : "";
}

function extractProductMetadataFromJsonLd(payload: unknown, result: ProductMeta) {
  if (!payload || typeof payload !== "object") return;
  const item = payload as Record<string, unknown>;
  const rawTypeValue = item["@type"];
  const typeValue = Array.isArray(rawTypeValue)
    ? rawTypeValue.map((value) => String(value)).join(" ")
    : String(rawTypeValue || "");
  const isProduct = typeValue.toLowerCase().includes("product");
  if (!isProduct && !Object.values(item).some((value) => value && typeof value === "object")) {
    return;
  }

  const name = normalizeProductMetaValue(
    typeof item.name === "string" ? item.name : item.title ? String(item.title) : undefined,
  );
  if (name) result.title = result.title || name;

  const description = normalizeProductMetaValue(typeof item.description === "string" ? item.description : undefined);
  if (description) result.description = result.description || description;

  const brand = item.brand;
  if (typeof brand === "string") {
    result.brand = result.brand || brand;
  } else if (brand && typeof brand === "object" && "name" in (brand as Record<string, unknown>)) {
    const brandName = normalizeProductMetaValue(String((brand as Record<string, unknown>).name));
    if (brandName) result.brand = result.brand || brandName;
  }

  const imageValue = item.image ?? item.imageURL ?? item.imageUrl;
  if (typeof imageValue === "string") {
    result.imageUrl = result.imageUrl || imageValue;
  } else if (Array.isArray(imageValue) && imageValue[0] && typeof imageValue[0] === "string") {
    result.imageUrl = result.imageUrl || imageValue[0];
  }

  const offers = item.offers;
  if (offers && typeof offers === "object") {
    const offerRecord = offers as Record<string, unknown>;
    const offerPrice = normalizeProductMetaValue(typeof offerRecord.price === "string" ? offerRecord.price : typeof offerRecord.price === "number" ? String(offerRecord.price) : undefined);
    const offerCurrency = normalizeProductMetaValue(typeof offerRecord.priceCurrency === "string" ? String(offerRecord.priceCurrency) : undefined);
    const offerAvailability = normalizeProductMetaValue(typeof offerRecord.availability === "string" ? offerRecord.availability : undefined);
    if (offerPrice) result.price = result.price || offerPrice;
    if (offerCurrency) result.currency = result.currency || offerCurrency;
    if (offerAvailability) result.availability = result.availability || offerAvailability;
  } else if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (offer && typeof offer === "object") {
        const offerRecord = offer as Record<string, unknown>;
        const offerPrice = normalizeProductMetaValue(typeof offerRecord.price === "string" ? offerRecord.price : typeof offerRecord.price === "number" ? String(offerRecord.price) : undefined);
        if (offerPrice && !result.price) result.price = offerPrice;
        const offerCurrency = normalizeProductMetaValue(typeof offerRecord.priceCurrency === "string" ? offerRecord.priceCurrency : undefined);
        if (offerCurrency && !result.currency) result.currency = offerCurrency;
        const offerAvailability = normalizeProductMetaValue(typeof offerRecord.availability === "string" ? offerRecord.availability : undefined);
        if (offerAvailability && !result.availability) result.availability = offerAvailability;
      }
    }
  }

  const rawSizes = [
    item.size,
    item.sizes,
    item.sizeList,
    item["availableSize"],
    item["availableSizes"],
    item["sizeRange"],
    item["size_chart"],
    item["sizeChart"],
  ];
  const sizeSet = new Set<string>(result.sizes ?? []);
  for (const rawSize of rawSizes) {
    collectSizesFromValue(sizeSet, rawSize);
  }
  if (sizeSet.size > 0) result.sizes = Array.from(sizeSet);

  const color = normalizeProductMetaValue(typeof item.color === "string" ? item.color : undefined);
  if (color) result.color = result.color || color;
  const material = normalizeProductMetaValue(typeof item.material === "string" ? item.material : undefined);
  if (material) result.material = result.material || material;
}

function walkJsonLdForProducts(node: unknown, result: ProductMeta, limit = 4): boolean {
  if (!node || limit <= 0) return false;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return false;
  if (Array.isArray(node)) {
    for (const child of node) {
      if (walkJsonLdForProducts(child, result, limit - 1)) return true;
    }
    return false;
  }

  const value = node as Record<string, unknown>;
  const typeValue = normalizeProductMetaValue(String(value["@type"] || ""));
  if (typeValue.toLowerCase().includes("product")) {
    extractProductMetadataFromJsonLd(value, result);
    return true;
  }

  for (const candidate of Object.values(value)) {
    if (walkJsonLdForProducts(candidate, result, limit - 1)) return true;
  }
  return false;
}

export function extractProductImageUrl(html: string, pageUrl: URL) {
  const candidates = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (content && ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"].includes(key)) {
      candidates.set(key, content);
    }
  }

  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const candidate = candidates.get(key);
    if (candidate) {
      try {
        return new URL(candidate, pageUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function parseProductMetadata(html: string, pageUrl: URL) {
  const result = extractProductMetadataFromHtml(html, pageUrl);
  const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][\s\S]*?>[\s\S]*?<\/script>/gi);

  if (jsonLdBlocks) {
    for (const block of jsonLdBlocks) {
      const match = block.match(/<script[^>]*type=["']application\/ld\+json["'][\s\S]*?>([\s\S]*?)<\/script>/i);
      if (!match?.[1]) continue;
      const payload = match[1].trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        walkJsonLdForProducts(parsed, result);
      } catch {
        // JSON-LD parse may fail on inline scripts with trailing commas/comments.
        // UI metadata is optional; only structured-data parser errors.
      }
    }
  }
  return result;
}

export async function downloadExternalImage(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<SafeImage> {
  const { response } = await fetchWithSafeRedirects(
    url,
    "image/jpeg,image/png,image/webp",
    options.timeoutMs,
  );
  const declaredType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (declaredType && !["image/jpeg", "image/png", "image/webp"].includes(declaredType)) {
    throw new ExternalImageError("invalid_image", "Bağlantı desteklenen bir görsel döndürmedi.");
  }

  const bytes = await readLimitedBytes(response, MAX_EXTERNAL_IMAGE_BYTES);
  const detected = detectImageType(bytes);
  if (!detected) {
    throw new ExternalImageError("invalid_image", "Görsel dosyası doğrulanamadı.");
  }
  return { bytes, ...detected };
}

export async function resolveProductImage(productUrl: string): Promise<SafeImage> {
  const { response, finalUrl } = await fetchWithSafeRedirects(productUrl, "text/html,application/xhtml+xml");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new ExternalImageError("page_unavailable", "Bağlantı bir ürün sayfası değil.");
  }

  const htmlBytes = await readLimitedBytes(response, MAX_HTML_BYTES);
  const imageUrl = extractProductImageUrl(new TextDecoder().decode(htmlBytes), finalUrl);
  if (!imageUrl) {
    throw new ExternalImageError("image_missing", "Ürün sayfasında paylaşılabilir kıyafet görseli bulunamadı.");
  }
  return downloadExternalImage(imageUrl);
}

export async function resolveProductMetadata(productUrl: string): Promise<ProductMeta> {
  const { response, finalUrl } = await fetchWithSafeRedirects(productUrl, "text/html,application/xhtml+xml");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new ExternalImageError("page_unavailable", "Bağlantı bir ürün sayfası değil.");
  }

  const html = new TextDecoder().decode(await readLimitedBytes(response, MAX_HTML_BYTES));
  const metadata = parseProductMetadata(html, finalUrl);
  if (metadata.imageUrl) {
    metadata.imageUrl = new URL(metadata.imageUrl, finalUrl).toString();
  }
  return metadata;
}
