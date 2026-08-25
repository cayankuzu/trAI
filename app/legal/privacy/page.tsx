import type { Metadata } from "next";
import { LegalScreen } from "@/components/legal-screen";

export const metadata: Metadata = { title: "Gizlilik Politikası" };

export default function PrivacyPage() {
  return (
    <LegalScreen code="E04" title="Gizlilik Politikası" active="privacy" intro="Bu politika, trAI web uygulamasında hangi verileri neden kullandığımızı ve kontrol seçeneklerini sade biçimde açıklar.">
      <section><h2>Topladığımız bilgiler</h2><p>Hesap bilgileri, isteğe bağlı boy, kilo ve beden ölçüleri, yüklediğin kişi fotoğrafları, seçtiğin katalog ürünü, oluşturulan sonuçlar ve hizmet güvenliği için teknik kayıtlar.</p></section>
      <section><h2>Fotoğraf güvenliği</h2><p>Fotoğrafların özel içeriktir; prova üretimi dışında reklam hedefleme amacıyla kullanılmaz ve açık iznin olmadan herkese açık paylaşılmaz.</p></section>
      <section><h2>Çerezler ve oturum</h2><p>trAI, hesabında oturum açmak ve güvenliği sağlamak için zorunlu oturum çerezleri kullanır. MVP sürümünde reklam veya isteğe bağlı analiz çerezi kullanılmaz.</p></section>
      <section><h2>Hizmet sağlayıcılar</h2><p>Veriler, yalnızca hizmeti çalıştırmak için gereken ölçüde; kimlik doğrulama ve özel depolama için Supabase, sanal prova üretimi için fal.ai, işlem e-postaları için Brevo ve barındırma için Vercel ile işlenebilir.</p></section>
      <section><h2>Saklama ve geçici sağlayıcı çıktısı</h2><p>fal.ai istek geçmişinde JSON girdi ve çıktı saklama kapalıdır; sağlayıcının geçici sonuç görseli 10 dakikalık yaşam süresiyle istenir ve bu sürede URL’yi bilen kişilerce erişilebilir olabilir. Doğrulanan sonuç özel Supabase alanına kopyalanır. MVP’de oluşturulan sonuçlar hesabını silene kadar saklanabilir; kaynak fotoğraflar üretim tamamlandığında temizlenmeye çalışılır.</p></section>
      <section><h2>Kontrolün</h2><p>Profil bilgilerini uygulama içinden güncelleyebilir ve hesabını, kayıtlı prova sonuçlarınla birlikte kalıcı olarak silebilirsin. Diğer veri taleplerin için destek kanalını kullanabilirsin.</p></section>
    </LegalScreen>
  );
}
