import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "E-posta adresini gir.")
  .email("Geçerli bir e-posta adresi gir.")
  .max(254, "E-posta adresi çok uzun.");

export const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı.")
  .max(72, "Şifre en fazla 72 karakter olabilir.")
  .regex(/[a-zA-ZÇĞİÖŞÜçğıöşü]/, "Şifre en az bir harf içermeli.")
  .regex(/\d/, "Şifre en az bir rakam içermeli.");

export const authSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(80, "Ad soyad çok uzun.").optional(),
  gender: z.enum(["female", "male", "other"]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Şifreni gir.").max(72, "Şifre çok uzun."),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z
    .string()
    .trim()
    .min(2, "Adını ve soyadını gir.")
    .max(80, "Ad soyad çok uzun."),
  gender: z.enum(["female", "male", "other"], {
    error: "Cinsiyet seçimini yap.",
  }),
});

export const passwordUpdateSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, "Yeni şifreni tekrar gir."),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Şifreler birbiriyle eşleşmiyor.",
    path: ["passwordConfirmation"],
  });

export const passwordChangeSchema = passwordUpdateSchema
  .and(
    z.object({
      currentPassword: z.string().min(1, "Mevcut şifreni gir.").max(72, "Şifre çok uzun."),
    }),
  )
  .refine((values) => values.currentPassword !== values.password, {
    message: "Yeni şifren mevcut şifrenden farklı olmalı.",
    path: ["password"],
  });

export const productUrlSchema = z
  .string()
  .trim()
  .url("Geçerli bir ürün bağlantısı gir.")
  .max(2_048, "Ürün bağlantısı çok uzun.")
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, {
    message: "Güvenli bir HTTPS bağlantısı kullan.",
  });

export const supportSchema = z.object({
  topic: z.enum(["try-on", "account", "quota"]),
  email: emailSchema,
  message: z
    .string()
    .trim()
    .min(10, "Mesaj en az 10 karakter olmalı.")
    .max(2_000, "Mesaj en fazla 2.000 karakter olabilir."),
});

// Supabase standard upload akışı 6 MB ve altı için önerilir; daha büyük dosyalar
// ileride resumable TUS upload ile desteklenebilir.
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validatePhoto(file: File) {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
    return "Yalnızca JPG, PNG veya WebP fotoğraf yükleyebilirsin.";
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return "Fotoğraf en fazla 6 MB olabilir.";
  }

  return null;
}
