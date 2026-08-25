import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  passwordResetErrorMessage,
  verificationEmailErrorMessage,
} from "./auth-errors";

describe("authErrorMessage", () => {
  it("geçersiz girişte kayıtlı e-posta adresini kontrol etmeyi söyler", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" }))
      .toBe("Kayıtlı e-posta adresi veya şifre hatalı.");
  });
});

describe("verificationEmailErrorMessage", () => {
  it("doğrulama gönderim hatasını sessiz başarıya dönüştürmez", () => {
    expect(verificationEmailErrorMessage({ message: "Provider unavailable" }))
      .toBe("Doğrulama e-postası gönderilemedi. Biraz sonra tekrar dene.");
  });
});

describe("passwordResetErrorMessage", () => {
  it("e-posta gönderim limitini kullanıcıya açıklar", () => {
    expect(passwordResetErrorMessage({
      code: "over_email_send_rate_limit",
      message: "Email rate limit exceeded",
    })).toContain("Çok fazla yenileme e-postası");
  });

  it("yetkisiz varsayılan SMTP alıcısını sessiz başarıya dönüştürmez", () => {
    expect(passwordResetErrorMessage({
      code: "email_address_not_authorized",
      message: "Email address not authorized",
    })).toContain("E-posta servisi");
  });

  it("bilinmeyen sağlayıcı hatasında güvenli genel mesaj döndürür", () => {
    expect(passwordResetErrorMessage({ message: "Unexpected provider failure" }))
      .toBe("Şifre yenileme e-postası gönderilemedi. Biraz sonra tekrar dene.");
  });
});
