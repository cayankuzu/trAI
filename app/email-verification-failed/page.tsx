import type { Metadata } from "next";
import { AuthNotice } from "@/components/auth-notice";

export const metadata: Metadata = { title: "Doğrulama bağlantısı geçersiz" };

export default function EmailVerificationFailedPage() {
  return (
    <AuthNotice
      eyebrow="BAĞLANTI GEÇERSİZ"
      title="E-postanı doğrulayamadık"
      description="Bu bağlantının süresi dolmuş, daha önce kullanılmış veya eksik olabilir."
      symbol="×"
      tone="error"
      primaryLabel="Yeni hesap bağlantısı al"
      primaryHref="/signup"
      secondaryLabel="Giriş yap"
      secondaryHref="/login"
      detail="Doğrulama bağlantıları güvenliğin için sınırlı süre kullanılabilir."
    />
  );
}

