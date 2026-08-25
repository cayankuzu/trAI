import type { Metadata } from "next";
import { AuthNotice } from "@/components/auth-notice";

export const metadata: Metadata = { title: "Şifre değiştirildi" };

type PasswordChangedPageProps = {
  searchParams: Promise<{ source?: string | string[] }>;
};

export default async function PasswordChangedPage({ searchParams }: PasswordChangedPageProps) {
  const { source } = await searchParams;
  const fromSettings = source === "settings";

  return (
    <AuthNotice
      eyebrow="İŞLEM TAMAMLANDI"
      title="Şifren güvenle değiştirildi"
      description={fromSettings
        ? "Yeni şifren artık hesabında geçerli. Açık oturumundan güvenle devam edebilirsin."
        : "Yeni şifren artık hesabında geçerli. Güvenliğin için yeniden giriş yap."}
      symbol="✓"
      tone="success"
      primaryLabel={fromSettings ? "Ayarlara dön" : "Yeni şifreyle giriş yap"}
      primaryHref={fromSettings ? "/settings" : "/login"}
      detail="Bu değişikliği sen yapmadıysan destek merkezi üzerinden hemen bize ulaş."
    />
  );
}

