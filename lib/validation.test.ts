import { describe, expect, it } from "vitest";
import {
  authSchema,
  passwordChangeSchema,
  passwordUpdateSchema,
  productUrlSchema,
  signupSchema,
  supportSchema,
  MAX_PHOTO_BYTES,
  validatePhoto,
} from "./validation";

describe("authSchema", () => {
  it("güçlü ve geçerli kullanıcı bilgisini kabul eder", () => {
    expect(authSchema.safeParse({ email: "jane@example.com", password: "guclu123", name: "Jane Doe", gender: "female" }).success).toBe(true);
  });

  it("rakam içermeyen şifreyi reddeder", () => {
    expect(authSchema.safeParse({ email: "john@example.com", password: "yalnizharf" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  const validSignup = {
    email: "jane@example.com",
    password: "guclu123",
    name: "Jane Doe",
    gender: "female",
  };

  it("tek güçlü şifreyle kayıt bilgisini kabul eder", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("zayıf kayıt şifresini reddeder", () => {
    expect(signupSchema.safeParse({
      ...validSignup,
      password: "yalnizharf",
    }).success).toBe(false);
  });
});

describe("passwordUpdateSchema", () => {
  it("güçlü ve eşleşen yeni şifreyi kabul eder", () => {
    expect(passwordUpdateSchema.safeParse({
      password: "yenisifre123",
      passwordConfirmation: "yenisifre123",
    }).success).toBe(true);
  });
});

describe("passwordChangeSchema", () => {
  it("yeni şifre mevcut şifreyle aynıysa reddeder", () => {
    expect(passwordChangeSchema.safeParse({
      currentPassword: "guclu123",
      password: "guclu123",
      passwordConfirmation: "guclu123",
    }).success).toBe(false);
  });
});

describe("productUrlSchema", () => {
  it("HTTPS ürün bağlantısını kabul eder", () => {
    expect(productUrlSchema.safeParse("https://magaza.example/urun/1").success).toBe(true);
  });

  it("HTTP bağlantısını reddeder", () => {
    expect(productUrlSchema.safeParse("http://magaza.example/urun/1").success).toBe(false);
  });

  it("bozuk bağlantıda hata fırlatmadan doğrulama hatası döndürür", () => {
    expect(() => productUrlSchema.safeParse("ürün-değil")).not.toThrow();
    expect(productUrlSchema.safeParse("ürün-değil").success).toBe(false);
  });
});

describe("validatePhoto", () => {
  it("Supabase standard upload sınırına uygun olarak 6 MB üzerini reddeder", () => {
    const oversized = { type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 } as File;
    expect(validatePhoto(oversized)).toContain("6 MB");
  });
});

describe("supportSchema", () => {
  it("çok kısa destek mesajını reddeder", () => {
    expect(supportSchema.safeParse({ topic: "try-on", email: "a@b.com", message: "kısa" }).success).toBe(false);
  });
});
