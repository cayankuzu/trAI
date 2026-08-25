import { describe, expect, it } from "vitest";
import { maskEmail } from "./auth-display";

describe("maskEmail", () => {
  it("e-posta adresinin kullanıcı bölümünü maskeler", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("ja••••••@example.com");
  });

  it("geçersiz veya boş değerde hiçbir bilgi göstermez", () => {
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail("gecersiz")).toBeNull();
  });
});

