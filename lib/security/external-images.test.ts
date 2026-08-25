import { describe, expect, it, vi } from "vitest";
import {
  detectImageType,
  extractProductImageUrl,
  isPublicIpAddress,
  lookupAddressesWithTimeout,
  matchesStorageImageExtension,
} from "./external-images";

describe("isPublicIpAddress", () => {
  it("yerel, loopback ve metadata ağlarını reddeder", () => {
    expect(isPublicIpAddress("127.0.0.1")).toBe(false);
    expect(isPublicIpAddress("10.0.0.8")).toBe(false);
    expect(isPublicIpAddress("169.254.169.254")).toBe(false);
    expect(isPublicIpAddress("::1")).toBe(false);
    expect(isPublicIpAddress("fd00::1")).toBe(false);
  });

  it("genel internet adreslerini kabul eder", () => {
    expect(isPublicIpAddress("1.1.1.1")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("lookupAddressesWithTimeout", () => {
  it("yanıt vermeyen DNS çözümlemesini katalog hazırlığında sınırsız bekletmez", async () => {
    vi.useFakeTimers();
    try {
      const pending = lookupAddressesWithTimeout(
        "cdn.example",
        2_500,
        () => new Promise(() => undefined),
      );
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("extractProductImageUrl", () => {
  it("OG görselini çözümleyip HTML entity değerlerini açar", () => {
    const html = '<meta content="/urun.jpg?width=900&amp;format=webp" property="og:image">';
    expect(extractProductImageUrl(html, new URL("https://magaza.example/urun/1")))
      .toBe("https://magaza.example/urun.jpg?width=900&format=webp");
  });
});

describe("detectImageType", () => {
  it("dosya uzantısına değil sihirli baytlara göre görseli doğrular", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))
      .toEqual({ contentType: "image/jpeg", extension: "jpg" });
    expect(detectImageType(new TextEncoder().encode("not an image"))).toBeNull();
  });

  it("magic-byte türünün Storage path uzantısıyla eşleşmesini zorunlu tutar", () => {
    expect(matchesStorageImageExtension("user/request/person.jpg", "jpg")).toBe(true);
    expect(matchesStorageImageExtension("user/request/person.JPG", "jpg")).toBe(true);
    expect(matchesStorageImageExtension("user/request/person.png", "jpg")).toBe(false);
    expect(matchesStorageImageExtension("user/request/person", "jpg")).toBe(false);
  });
});
