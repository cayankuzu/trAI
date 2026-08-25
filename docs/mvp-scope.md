# MVP kapsamı ve yayın kararı

## Ürün vaadi

Kullanıcı, trAI'nin kontrollü kataloğundan bir ürün seçer ve kendi fotoğrafını ekler; kıyafeti üzerinde görür, önce/sonra karşılaştırır, sonucu kaydeder ve ürünün mağaza sayfasına gider. trAI kesin beden veya kalıp doğruluğu iddia etmez; görsel satın alma karar desteği sunar.

## Kodlanan MVP kapsamı

- Tek mobile-first responsive sistem; telefon, tablet ve bilgisayarda aynı bilgi sırası ve cihaz genişliğine uyarlanan navigasyon.
- E-posta/şifre kaydı, cinsiyet alanı, e-posta doğrulama, giriş, şifre sıfırlama, oturum içi şifre değiştirme ve güvenli çıkış ekranları.
- JPG/PNG/WebP kişi fotoğrafı için 6 MiB sınır ve istemci/sunucu doğrulaması.
- Elle seçilmiş ürünlerden oluşan kontrollü katalog; yerel ürün görselleri, aynı ürüne ait sabit yüksek çözünürlüklü sağlayıcı referansları ve güvenli yerel fallback, ürün ayrıntıları, kaynak mağaza bağlantısı ve bilgilendirici beden tablosu.
- Vercel’in 4,5 MB Function body sınırını aşmamak için private Supabase Storage’a direct signed upload.
- fal.ai FASHN v1.6 ürün-sadakati varsayılanı ve isteğe bağlı FLUX 2 LoRA beden görünümü Beta; idempotent request ID, timeout/hata eşleme ve private sonuç saklama.
- Profilde isteğe bağlı boy, kilo ve çevre ölçüleri ile üst beden ve EU/W pantolon bedeni; katalog vücut ölçüsü rehberiyle deterministik önerilen/dar/rahat beden hesabı.
- Ürün detayı modunda ön/arka görünüm başına tek çıktı; Beta modunda birden fazla beden ve gerçek ön/arka kişi fotoğrafı için ayrı varyantlar, önce/sonra paneli ve iki beden karşılaştırması.
- İsimli ve gruplu kombin kaydı; kartı genişleterek tüm beden/görünüm sonuçlarını inceleme, yeniden adlandırma, gruba taşıma ve silme.
- Ortak workspace layout ve kullanıcıya özel session taslağı sayesinde Prova/Kombinler/Profil geçişlerinde seçimlerin sıfırlanmaması.
- Supabase Auth, Postgres, private Storage, kullanıcı bazlı RLS, aylık 5 üretim kotası ve yarış koşulu korumalı claim/lease RPC’leri.
- Profil, ölçüler, destek formu, çevrimdışı bildirim ve özel hata/boş/başarı durumları.
- Hesap ve ilişkili verileri silme akışı.
- KVKK, gizlilik ve kullanım koşulları taslak rotaları.

“Kodlandı” ifadesi, harici servis/panel veya gerçek cihaz kabul testinin geçtiği anlamına gelmez.

## Bilinçli MVP sınırları

- Beden önerisi profil ile katalogdaki **hedef vücut ölçüsü** rehberinin deterministik karşılaştırmasıdır. Varsayılan FASHN sonucu beden simülasyonu değildir. Yalnız FLUX Beta seçilen bedeni dar/dengeli/rahat metin talimatına çevirir; ham santimetre veya kumaş fiziği kullanmaz ve ürün ayrıntısını değiştirebilir.
- Güvenilir arka sonuç için kullanıcının arkadan çekilmiş ayrı fotoğrafı ve ürünün katalog arka görseli gerekir; ön fotoğraftan arka beden/kimlik uydurulmaz.
- Production aylık kotası beş görseldir. Ürün detayı modunda her ön/arka görünüm; Beta'da her beden × görünüm ayrı hak sayılır. Yalnız yerel `next dev` test bayrağı açıkken uygulama kotası kaldırılabilir; fal.ai kredi ve sağlayıcı sınırları devam eder.
- Katalog ürünleri MVP'de elle eklenir. Yönetim paneli, rastgele mağaza linki içe aktarma, ödeme/abonelik ve sosyal özellikler kapsam dışıdır.
- fal.ai sonucu aynı HTTP isteği içinde beklenir; webhook/polling tabanlı asenkron iş akışı sonraki ölçek adımıdır.
- 6 MiB üzeri dosyalar ve HEIC desteklenmez; daha büyük dosyalar için TUS resumable upload gerekir.
- Yerel IP rate limiter dağıtık değildir; maliyet kontrolünün ana kaynağı veritabanı kotasıdır.
- Hukuki metinler ürün taslağıdır; hukuk görüşü değildir.

## Production öncesi zorunlu işler

1. Uzak Supabase `001`–`010` migration geçmişini korumak; RLS/RPC/Storage politikalarını preview ve production kullanıcılarıyla yeniden test etmek. `005` batch akışını, `006` beden/kombin update doğrulamasını, `007` kombin sahipliği ve append-only upload’ı, `008` korunmuş temizlik metadatası/service-only lazy stale cleanup ile provider hata-kota geçişlerini sertleştirir; `009` cleanup RPC `request_id` hotfix’idir, `010` kilo profili ve server-owned yerel test muafiyetidir.
2. Server-only `FAL_KEY` değerini Vercel ortamlarına eklemek, fal.ai kredisi yüklemek ve gerçek fotoğraflarla başarı/hata/timeout/kota uçtan uca testlerini yapmak.
3. Production alan adı ve doğrulanmış sender ile Brevo SMTP’yi Supabase’e bağlamak; doğrulama ve parola e-postalarını gerçek mailbox’larda test etmek.
4. Vercel environment variables, custom domain/HTTPS, Fluid/duration davranışı ve direct upload akışını preview/production ortamında doğrulamak.
5. Telefon/tablet/bilgisayar tarayıcı matrisi, klavye, ekran okuyucu, Lighthouse ve görsel regresyon QA’sını tamamlamak.
6. Canlı kabul testinden geçen istek-tetiklemeli lazy cleanup’a ek olarak yarım kalan/stale Storage nesneleri için trafiğe bağlı olmayan periyodik cleanup kurmak; hata izleme, yapılandırılmış log, maliyet/kota alarmı, veri saklama ve yetkili destek operasyonu eklemek.
7. KVKK, gizlilik ve kullanım koşullarını gerçek tüzel kişi, iletişim, saklama süresi ve alt işleyenlerle hukuk uzmanına onaylatmak.

## Yayın kararı

- **Portfolyo veya kontrollü demo:** Final yerel kalite komutları ve temel tarayıcı smoke testi geçince uygundur.
- **Davetli test kullanıcıları:** Supabase migrasyonları, FAL gerçek testi ve Brevo teslimatı tamamlandıktan sonra uygundur.
- **Herkese açık production:** Tüm [yayın öncesi QA maddeleri](qa-checklist.md), hukuk ve operasyon kontrolleri tamamlanmadan uygun değildir.
