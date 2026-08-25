import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthNotice } from "@/components/auth-notice";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "E-posta doğrulandı" };

export default async function EmailVerifiedPage() {
  const supabase = await createClient();

  if (supabase) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user?.email_confirmed_at) {
      redirect("/try-on");
    }
  }

  return (
    <AuthNotice
      eyebrow="HESAP ETKİN"
      title="E-postan doğrulandı"
      description="trAI hesabın artık aktif. Fotoğrafını ve ürününü ekleyerek ilk sanal provanı oluşturabilirsin."
      symbol="✅"
      tone="success"
      primaryLabel="İlk provanı oluştur"
      primaryHref="/try-on"
      secondaryLabel="Profilini tamamla"
      secondaryHref="/profile"
      detail="Doğrulama işlemi tamamlandı ve güvenli oturumun açıldı."
    />
  );
}
