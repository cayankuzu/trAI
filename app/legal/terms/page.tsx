import type { Metadata } from "next";
import { LegalScreen } from "@/components/legal-screen";

export const metadata: Metadata = { title: "Kullanım Koşulları" };

export default function TermsPage() {
  return (
    <LegalScreen code="E05" title="Kullanım Koşulları" active="terms" intro="trAI hizmetini kullanırken geçerli olan temel kuralları, sınırları ve kullanıcı sorumluluklarını açıklar.">
      <section><h2>Hizmet kapsamı</h2><p>trAI görsel bir sanal prova ve karar destek deneyimidir; sonuçlar ürünün gerçek kalıbı veya rengi için kesin garanti oluşturmaz.</p></section>
      <section><h2>Kullanıcı sorumluluğu</h2><p>Yalnızca kullanım hakkına sahip olduğun kişi fotoğraflarını yüklemelisin. Katalogdaki mağaza bağlantıları bilgilendirme amacıyla sunulur.</p></section>
      <section><h2>Ücretsiz kullanım</h2><p>Ücretsiz planda ayda 5 sanal prova başlatılabilir. Sağlayıcıda üretim başlamadan sonlanan teknik işlemler hakkını korur; üretim başladıktan sonra oluşan hata veya zaman aşımı kullanım hakkı sayılabilir.</p></section>
      <section><h2>Hesap güvenliği</h2><p>Şifreni gizli tutmalı ve yetkisiz bir kullanım fark ettiğinde destek ekibine bildirmelisin.</p></section>
    </LegalScreen>
  );
}
