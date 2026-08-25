import type { Metadata } from "next";
import { AuthNotice } from "@/components/auth-notice";

export const metadata: Metadata = { title: "Şifre bağlantısı geçersiz" };

export default function InvalidResetLinkPage() {
  return (
    <AuthNotice
      eyebrow="BAĞLANTI GEÇERSİZ"
      title="Yeni bir şifre bağlantısı iste"
      description="Bu yenileme bağlantısının süresi dolmuş, daha önce kullanılmış veya güvenli oturumu kapanmış olabilir."
      symbol="×"
      tone="error"
      primaryLabel="Yeni bağlantı gönder"
      primaryHref="/forgot-password"
      secondaryLabel="Girişe dön"
      secondaryHref="/login"
      detail="Eski bağlantı artık kullanılamaz; yeni bağlantı gönderildiğinde yalnızca en güncel e-postayı kullan."
    />
  );
}

