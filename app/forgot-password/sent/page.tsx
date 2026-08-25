import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AuthNotice } from "@/components/auth-notice";
import { AUTH_EMAIL_COOKIE } from "@/lib/auth-cookies";
import { maskEmail } from "@/lib/auth-display";

export const metadata: Metadata = { title: "Şifre bağlantısı gönderildi" };

export default async function PasswordResetSentPage() {
  const cookieStore = await cookies();
  const maskedEmail = maskEmail(cookieStore.get(AUTH_EMAIL_COOKIE)?.value);

  return (
    <AuthNotice
      eyebrow="E-POSTANI KONTROL ET"
      title="Yenileme bağlantın yolda"
      description={maskedEmail
        ? `${maskedEmail} bir trAI hesabıyla eşleşiyorsa güvenli şifre yenileme bağlantısını gönderdik.`
        : "Girdiğin adres bir trAI hesabıyla eşleşiyorsa güvenli şifre yenileme bağlantısını gönderdik."}
      symbol="✉"
      tone="neutral"
      primaryLabel="Girişe dön"
      primaryHref="/login"
      secondaryLabel="Tekrar dene"
      secondaryHref="/forgot-password"
      detail="E-posta birkaç dakika içinde gelmezse spam klasörünü kontrol et. Güvenliğin için bir hesabın var olup olmadığını bu ekranda açıklamayız."
    />
  );
}

