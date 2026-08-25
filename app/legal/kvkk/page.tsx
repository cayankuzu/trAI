import type { Metadata } from "next";
import { LegalScreen } from "@/components/legal-screen";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };

export default function KvkkPage() {
  return (
    <LegalScreen code="E03" title="KVKK Aydınlatma Metni" active="kvkk" intro="Kişisel verilerinin hangi amaçlarla işlendiğini, hukuki sebepleri ve haklarını özetler.">
      <section><h2>Veri sorumlusu</h2><p>trAI, hizmet kapsamındaki kişisel verilerin işlenme amaçlarını ve yöntemlerini belirleyen veri sorumlusudur.</p></section>
      <section><h2>İşlenen veriler</h2><p>Kimlik ve iletişim bilgileri, beden ölçüleri, yüklenen fotoğraflar, kullanım tercihleri ve güvenlik kayıtları işlenebilir.</p></section>
      <section><h2>İşleme amacı</h2><p>Sanal prova oluşturmak, hesabını yönetmek, güvenliği sağlamak, destek sunmak ve yasal yükümlülükleri yerine getirmek.</p></section>
      <section><h2>Hakların</h2><p>Verilerine erişme, düzeltme, silme, işlemeyi sınırlandırma ve mevzuattaki koşullarda itiraz etme hakkına sahipsin.</p></section>
    </LegalScreen>
  );
}
