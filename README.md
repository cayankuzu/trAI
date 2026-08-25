# trAI Web MVP

trAI, kontrollü ürün kataloğundaki bir kıyafeti kullanıcının kendi ön/arka fotoğraflarında görmesini, ayrı beden önerisi almasını ve sonuçları isimli/gruplu kombin olarak kaydetmesini sağlayan mobile-first responsive bir web uygulamasıdır. Ürün ayrıntısını koruyan akış varsayılandır; çoklu beden görselleştirmesi açıkça işaretlenmiş deneysel bir Beta'dır.

## Mevcut durum

| Alan | Durum |
| --- | --- |
| Responsive web arayüzü ve kontrollü ürün kataloğu | Kodlandı; final tarayıcı/cihaz matrisi yeniden doğrulanmalı |
| Supabase Auth, veritabanı ve özel Storage | Uygulama kodu hazır; uzak projede `001`–`010` migrasyonları uygulandı, kilo profili ile normal/test batch kabul testleri geçti |
| fal.ai sanal prova | FASHN v1.6 ürün-sadakati varsayılanı ve isteğe bağlı FLUX 2 beden görünümü Beta hattı kodlandı; yeni FASHN varsayılanı production öncesi sabit kabul setiyle yeniden doğrulanmalı |
| E-posta doğrulama ve parola kurtarma | Akışlar ve Supabase şablonları hazır; Brevo SMTP/panel ayarı ve gerçek teslimat testi henüz yapılmadı |
| Production yayını | Uzak migrasyon zinciri güncel; Vercel ortam değişkenleri/deploy, alan adı, SMTP, hukuk ve operasyon kontrolleri bekliyor |

Bu nedenle proje yerel MVP olarak kullanılabilir; gerçek kişisel veriyle herkese açık production yayınına henüz hazır kabul edilmemelidir.

## Yerelde çalıştırma

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Next.js varsayılan olarak `http://localhost:3000` adresini kullanır. Port doluysa bir sonraki boş porta geçebilir; terminalde yazan URL esas alınmalıdır.

### Gerekli ortam değişkenleri

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=sb_secret_your-server-only-key
FAL_KEY=your-server-only-fal-key
TRY_ON_UNLIMITED_TEST_MODE=false
```

- Publishable Supabase değişkenleri yalnız kullanıcı oturumunu doğrular.
- `SUPABASE_SECRET_KEY` (`sb_secret_...`) kota/durum RPC’leri ve private Storage işlemleri için yalnız sunucuda kullanılır. Eksikken sanal prova güvenli biçimde 503 ile kapanır.
- `SUPABASE_SECRET_KEY` ve `FAL_KEY` adlarında kesinlikle `NEXT_PUBLIC_` bulunmamalıdır.
- Gizli anahtarlar repoya eklenmemeli veya sohbet içinde paylaşılmamalıdır.
- Sanal prova rotasında demo/sahte sonuç yolu yoktur; kullanıcı oturumu, imzalı fotoğraf yüklemesi ve gerçek kota kaydı zorunludur.
- `TRY_ON_UNLIMITED_TEST_MODE=true` yalnız yerel `next dev` sürecinde uygulama kota, batch ve kısa süreli rate limitlerini test için kapatır. Vercel/production’da etkinleşmez; fal.ai kredi veya sağlayıcı limitlerini kaldırmaz.

## Sanal prova veri akışı

Vercel Function istek gövdeleri 4,5 MB ile sınırlı olduğundan fotoğraflar uygulama API’sine multipart olarak gönderilmez:

1. İstemci `/api/try-ons/upload-intent` rotasına session, seçilen beden/görünüm manifesti ve dosya metadatasını içeren küçük bir JSON isteği gönderir.
2. Çerezli Supabase istemcisi yalnız doğrulanmış kullanıcı kimliğini okur. Ayrı server-only secret client, kullanıcı kimliğini açık `p_user_id` olarak atomik batch kota RPC’sine geçirir ve her üretilecek görünüm için tek kullanımlık exact-path yükleme izni üretir.
3. Tarayıcı, genel bir Storage mutation politikası olmadan, yalnız exact-path ve append-only imzalı token ile JPG, PNG veya WebP dosyasını doğrudan private `user-photos` bucket’ına yükler. Bucket ve uygulama limiti dosya başına 6 MiB’tır.
4. İstemci `/api/try-ons` rotasına session, `requestId`, beden, görünüm ve kontrollü katalog ürün kimliğini gönderir. Server-only client bunların tamamını DB-owned manifest ile sınırlar; dosyaları magic-byte ve path uzantısıyla yeniden doğrular. Üretim için katalogda sabitlenmiş, aynı ürüne ait yüksek çözünürlüklü ön/arka referans önceliklendirilir; mağaza CDN'i kullanılamazsa yerel katalog master'ına dönülür.
5. Sonuç fal CDN’inden doğrulanarak özel Supabase Storage’a kopyalanır; arayüze kısa ömürlü imzalı URL döner. FAL payload saklama kapalıdır ve geçici CDN çıktısı 10 dakikalık yaşam süresiyle istenir.

Uzak Supabase zincirinde `001`–`010` migrasyonlarının tamamı uygulanmıştır. `005` çoklu beden/session ve kombin grubu sözleşmesini, `006` beden/kombin güncellemelerini, `007` kombin sahipliğini ve append-only yüklemeyi sertleştirir. `008`, temizlik yollarını Storage silme işlemi başarıyla bitene kadar korur; yalnız `service_role` tarafından çağrılabilen lazy stale cleanup ekler, `provider_cancelled` durumunda kotayı iade eder ve belirsiz provider submit’ini olası ücret nedeniyle kotada tutar. `009`, cleanup RPC’sindeki `request_id` ad çakışmasını düzeltir. `010`, isteğe bağlı kilo alanını ve yalnız sunucu kontrollü yerel test modunda kullanılan kalıcı kota muafiyeti işaretini ekler.

Lazy cleanup canlı geçici kullanıcıyla, yetkisiz `authenticated` çağrı reddiyle birlikte kabul testinden geçmiştir. Bu istek-tetiklemeli güvenlik ağı çalışır durumdadır; trafiğe bağlı kalmayan periyodik Storage cleanup görevi production takibi olarak ayrıca kurulmalıdır.

Beden önerisi, profil ölçüleri ile katalog beden rehberini deterministik olarak karşılaştırır. Varsayılan `fal-ai/fashn/tryon/v1.6`, `quality` + doğru kategori + görünüm bazlı `flat-lay`/`model` referans tipi + PNG ayarlarıyla ürün baskısı/dokusu öncelikli, görünüm başına tek sonuç üretir; beden ölçüsünü görsele uygulamaz. İsteğe bağlı `fal-ai/flux-2-lora-gallery/virtual-tryon` Beta, beden önerisini yalnız dar/dengeli/rahat metin talimatına çevirir ve ürün ayrıntısını değiştirebilir. İki mod da fiziksel kalıp veya gerçek uyum garantisi vermez.

## Kalite komutları

```powershell
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

Güncel ve dürüst doğrulama durumu [docs/verification-report.md](docs/verification-report.md), production kontrol listesi [docs/qa-checklist.md](docs/qa-checklist.md) dosyasındadır.

Son doğrulanmış `npm test` çalışması 38 test dosyasında 239 testin geçtiğini gösterdi.

## Klasörler

- `app/`: Next.js App Router sayfaları, Server Actions, Route Handler’lar ve durum ekranları.
- `components/`: Ortak UI ve ekran bileşenleri.
- `lib/`: Doğrulama, fal.ai istemcisi/kuyruğu, Supabase istemcileri, güvenlik yardımcıları ve demo verisi.
- `supabase/migrations/`: Şema, RLS, hesap silme sertleştirmesi ve sanal prova kota/yükleme hattı.
- `supabase/templates/`: E-posta doğrulama ve parola kurtarma şablonları.
- `public/`: Statik ikonlar, demo görselleri ve çevrimdışı kabuk.
- `docs/`: Kurulum, rota haritası, MVP kapsamı ve yayın kontrolleri.

## Kurulum belgeleri

- [Supabase kurulumu](docs/supabase-setup.md)
- [fal.ai sanal prova kurulumu](docs/fal-ai-setup.md)
- [Brevo SMTP kurulumu](docs/brevo-smtp.md)
- [Rota haritası](docs/route-map.md)
- [MVP kapsamı](docs/mvp-scope.md)
