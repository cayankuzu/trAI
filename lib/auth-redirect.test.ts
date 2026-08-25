import { describe, expect, it } from "vitest";
import {
  getAuthConfirmFailureDestination,
  getSafeAuthConfirmDestination,
} from "./auth-redirect";

describe("getSafeAuthConfirmDestination", () => {
  it.each(["/email-verified", "/reset-password"])(
    "izin verilen %s rotasını korur",
    (destination) => {
      expect(getSafeAuthConfirmDestination(destination)).toBe(destination);
    },
  );

  it.each([
    null,
    "",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/try-on",
    "/profile",
    "/reset-password?next=/profile",
  ])("izin verilmeyen %s değerini güvenli varsayılana çevirir", (value) => {
    expect(getSafeAuthConfirmDestination(value)).toBe("/email-verified");
  });
});

describe("getAuthConfirmFailureDestination", () => {
  it("şifre kurtarma hatasını özel geçersiz bağlantı ekranına yollar", () => {
    expect(getAuthConfirmFailureDestination("/reset-password")).toBe(
      "/reset-password/invalid",
    );
  });

  it("diğer doğrulama hatalarını e-posta hata ekranına yollar", () => {
    expect(getAuthConfirmFailureDestination(null)).toBe(
      "/email-verification-failed",
    );
  });
});
