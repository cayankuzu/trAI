# fal.ai sanal prova kurulumu

trAI varsayılan sanal prova için ürün baskısı/deseni aktarımına odaklanan `fal-ai/fashn/tryon/v1.6` modelini kullanır. Açıkça seçilen “Beden görünümü Beta” ise `fal-ai/flux-2-lora-gallery/virtual-tryon` ile yalnız yaklaşık dar/dengeli/rahat görsel yönlendirme yapar. `FAL_KEY` yalnız Next.js sunucu kodunda okunur ve tarayıcıya gönderilmez.

## Şu anki durum

- Entegrasyon, kuyruk takibi, hata eşleme, idempotent istek kimliği ve private Storage sonucu kodlandı.
- Uzak Supabase projesinde `001`–`010` migrasyonları uygulandı; dry-run güncel. `007` kombin sahipliği/append-only upload’ı, `008` korunmuş cleanup metadatası ile service-only lazy stale cleanup ve sağlayıcı hata-kota geçişlerini, `009` cleanup RPC `request_id` hotfix’ini, `010` ise kilo profili ve yerel test kota muafiyetini içerir.
- `SUPABASE_SECRET_KEY` ve `FAL_KEY` yerel sunucu ortamında tanımlı; production/Vercel ortamı ayrıca yapılandırılmalıdır.
- Kredili FLUX karşılaştırma çıktıları yerelde incelendi; baskı/doku kayması görüldüğü için FASHN varsayılan yapıldı. Yeni FASHN varsayılanı production öncesi sabit kişi/ürün kabul setiyle yeniden doğrulanmalıdır. Sanal prova için development demo yolu yoktur.

## Ön koşullar

1. fal.ai hesabında prepaid kredi bulunmalıdır.
2. fal.ai Dashboard’da yalnız API kullanımı için bir anahtar oluşturulmalıdır; yönetici yetkili anahtar kullanılmamalıdır.
3. Supabase `001`–`010` migrasyonları dosya adı sırasıyla uygulanmalıdır.
4. Supabase Auth ve private `user-photos` bucket/RLS politikaları çalışır olmalıdır.
5. Supabase’in yeni `sb_secret_...` secret key’i yalnız Next.js server ortamında tanımlanmalıdır.

Ürün detayı modunda her ön/arka görünüm bir FASHN üretimidir ve aynı görünüm farklı bedenler için tekrar üretilmez. Beden görünümü Beta'da her beden × görünüm ayrı FLUX üretimi ve ayrı kota/kredidir. Fiyat ve ticari kullanım koşulları production kararından önce [FASHN v1.6](https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api) ve [FLUX 2 LoRA VTO](https://fal.ai/models/fal-ai/flux-2-lora-gallery/virtual-tryon/api) sayfalarından yeniden kontrol edilmelidir; uygulama dokümanında sabit fiyat varsayılmaz.

## Yerel kurulum

`.env.local` dosyasına ekleyin:

```dotenv
SUPABASE_SECRET_KEY=sb_secret_your-server-only-key
FAL_KEY=your-server-only-key
TRY_ON_UNLIMITED_TEST_MODE=false
```

Bu iki anahtarın adında `NEXT_PUBLIC_` bulunmamalıdır. Anahtarları kaynak koda, ekran görüntüsüne, issue’ya veya sohbet mesajına koymayın. Değişiklikten sonra development sunucusunu yeniden başlatın. `SUPABASE_SECRET_KEY` yoksa upload/üretim rotaları 503 ile güvenli biçimde kapanır.

Yerel testte `TRY_ON_UNLIMITED_TEST_MODE=true`, yalnız `next dev` çalışırken uygulama kota/batch/rate kontrollerini kapatır. Bu bayrak Vercel veya production’da etkinleşmez ve fal.ai kredi/sağlayıcı sınırlarını değiştirmez.

## Neden doğrudan Supabase upload kullanılıyor?

Vercel Functions istek/yanıt gövdesi 4,5 MB ile sınırlıdır. Fotoğrafı `/api/try-ons` üzerinden multipart geçirmek, uygulamanın 6 MiB fotoğraf limitinden önce Vercel’de `413 FUNCTION_PAYLOAD_TOO_LARGE` üretir.

Uygulanan akış:

1. İstemci, session kimliği, seçilen beden/görünüm manifesti, dosya metadatası ve kontrollü katalogdaki ürün kimliğiyle `/api/try-ons/upload-intent` rotasına küçük JSON gönderir. Rota yeni claim’den önce aynı kullanıcı için sınırlı bir lazy stale cleanup turu çalıştırır.
2. Çerezli istemci yalnız kullanıcı claim’ini doğrular. Ayrı secret client, doğrulanan kimliği `p_user_id` ile yalnız `service_role` yetkili `claim_try_on_batch` RPC’sine geçirir. Normal modda en fazla beş varyant; açık yerel test modunda katalog manifestinin yapısal üst sınırına kadar varyant tek transaction içinde rezerve edilir.
3. Secret client exact-path, tek kullanımlık ve append-only Supabase signed upload token’ı döndürür. Authenticated role için Storage insert/update/delete politikası bulunmaz.
4. Tarayıcı JPG, PNG veya WebP dosyasını doğrudan private `user-photos` bucket’ına `uploadToSignedUrl` ile gönderir.
5. İstemci `/api/try-ons` rotasına yalnız session, request, beden, görünüm ve aynı katalog ürün kimliğini yollar. Sunucu path kabul etmez; tüm alanları DB-owned kayıtla birebir karşılaştırır ve kişi fotoğrafı path’ini veritabanından okur.
6. Sunucu kişi fotoğrafını ve yalnız kontrollü katalog manifestinden çözdüğü kıyafet görselini boyut, magic-byte ve uzantı eşleşmesiyle doğrular. Aynı ürüne ait sabit yüksek çözünürlüklü mağaza referansı önce güvenli biçimde indirilir; CDN erişilemezse yerel master kullanılır. Flat-lay referans boşlukları kırpılmış, güvenli kenar boşluklu 1024×1024 kayıpsız PNG'ye dönüştürülür; model üstündeki arka referans özgün çözünürlükte korunur ve doğru `garment_photo_type` ile 15 dakikalık imzalı okuma URL'leri fal.ai’ye verilir.
7. fal.ai sonucu yeniden indirilip doğrulanır ve private Storage’a kopyalanır; istemciye yalnız kısa ömürlü Supabase imzalı URL verilir.

## fal.ai veri saklama sınırı

- Her kuyruk isteği `X-Fal-Store-IO: 0` ile gönderilir; fal.ai tarafındaki JSON input/output geçmişi için varsayılan 30 günlük saklama kapatılır.
- Üretilen fal CDN görseli `X-Fal-Object-Lifecycle-Preference` üzerinden 10 dakika sonra silinecek şekilde işaretlenir. Bu URL, süresi dolana kadar URL’yi bilen kişilerce erişilebilir olabilir.
- Uygulama sonucu hemen doğrular ve private Supabase Storage’a kopyalar. Kalıcı kullanıcı erişimi fal CDN URL’siyle değil, kısa ömürlü Supabase signed URL ile sağlanır.
- Tarayıcı taslağı kısa ömürlü sonuç URL'sini kalıcı kabul etmez. Tam sayfa yenilemesinde session/request kimlikleri korunur ve private Storage için taze URL `/api/try-ons` üzerinden sınırlı retry ile alınır.
- Bu ayarlar gerçek FAL isteğinde ve hesap veri saklama ayarlarında production öncesi ayrıca doğrulanmalıdır.

6 MiB, Supabase standard upload ve private bucket için seçilmiş MVP sınırıdır. Daha büyük dosyalar desteklenmek istenirse ayrı TUS resumable upload tasarımı ve yeniden QA gerekir.

## Kota ve tekrar deneme

- `003` ve `005` migrasyonları aylık ücretsiz kotayı 5 başarılı/başlatılmış **görsel** olarak uygular; bir bedenin ön+arka sonucu iki hak sayılır.
- Kota istemciye açık olmayan ledger, transaction/advisory lock ve `requestId` ile korunur.
- Aynı istek kimliği, sağlayıcı istek kimliği kaydedildiyse devam ettirilebilir; yeniden denemede gereksiz ikinci kredi tüketiminin önüne geçilmeye çalışılır.
- İlk queue `POST` isteği SDK’nın otomatik istemci retry katmanından geçirilmez ve tam bir kez gönderilir. Ağ yanıtı belirsizse uygulama otomatik ikinci üretim başlatmaz; bu durum ayrı terminal hata olarak kaydedilir.
- Sağlayıcıya hiç ulaşılmadığı bilinen `provider_start_timeout` rezervasyonu güvenle serbest bırakılır.
- Sağlayıcının açıkça iptal ettiği `provider_cancelled` sonucu kotayı iade eder; ağ sonucu belirsiz `provider_submit_uncertain` ise olası ücret nedeniyle kotada tutulur.
- Provider’a ulaşmadan terk edilen stale claim/rezervasyonların kötüye kullanımını sınırlamak için kullanıcı başına günlük en fazla 20 yeni rezervasyon vardır. Bu veritabanı sınırı, yarım kalan Storage nesnelerini silmez; periyodik Storage cleanup ayrıca kurulmalıdır.
- Tamamlanmış/başarısız veya süresi dolmuş kayıtlarda kaynak yollar DB’de, Storage silme başarılı olana kadar tutulur. `claim_stale_try_on_cleanup` ve `finalize_try_on_input_cleanup` yalnız `service_role` erişimindedir; authenticated kullanıcı bu RPC’leri doğrudan çalıştıramaz.
- Yerel bellekteki IP rate limiter yalnız ek korumadır; dağıtık production maliyet kontrolünün kaynağı değildir. Asıl kontrol veritabanı kotasıdır.
- `010` ile yerel test kayıtları server-owned `quota_exempt` işareti taşır. Bu kayıtlar aylık 5 ve günlük 20 uygulama kotasını tüketmez; authenticated tarayıcı rolü işareti doğrudan yazamaz.

## Süre ve deployment

`/api/try-ons` Node.js runtime kullanır ve `maxDuration = 180` tanımlar. Vercel projesinde bu sürenin plan/runtime ayarlarıyla desteklendiği doğrulanmalıdır. Mevcut MVP kuyruk sonucunu aynı HTTP isteği içinde bekler; trafik veya gecikme büyüdüğünde webhook/polling tabanlı asenkron tamamlama daha güvenli olacaktır.

Vercel’de `SUPABASE_SECRET_KEY` ve `FAL_KEY`, Project Settings > Environment Variables alanına yalnız gereken ortamlarda ve server-only olarak eklenmelidir. Preview ve Production ayrı ayrı doğrulanmalıdır.

## Gerçek sağlayıcı kabul testi

Aşağıdakiler tamamlanmadan entegrasyonu production için “doğrulandı” saymayın:

- [x] `001`–`010` migrasyonları uzak Supabase projesine uygulandı; normal/test batch RPC, kilo profili, idempotency, append-only upload ve varyant metadata kabul testleri geçti.
- [x] Canlı geçici kullanıcıyla lazy stale cleanup Storage silme/finalize akışı ve `authenticated` cleanup RPC reddi geçti; `009` hotfix’i canlıda doğrulandı.
- [x] `SUPABASE_SECRET_KEY` yerel server ortamına eklendi; kodda yalnız server-only admin client tarafından okunuyor.
- [ ] API-scope `FAL_KEY` Vercel ortamına güvenli biçimde eklendi; yerel ortamda tanımlı.
- [ ] fal.ai hesabında kredi var.
- [ ] Kişi fotoğrafı + kontrollü katalog görseliyle gerçek sonuç alındı.
- [ ] 6 MiB’a yakın dosya Vercel’i dolaşmadan doğrudan Storage’a yüklendi.
- [ ] Kota dolması, provider timeout, retry ve aynı `requestId` akışları gerçek ortamda test edildi.
- [ ] FAL request history’de payload saklanmadığı ve çıktı CDN nesnesinin yaklaşık 10 dakika sonunda silindiği doğrulandı.
- [x] Kaynak/kıyafet geçici dosyalarının başarı/terminal hata sonrasında anlık veya sonraki lazy cleanup turunda silinmesi kod ve canlı stale kabul testiyle doğrulandı.
- [ ] Lazy cleanup’a ek olarak yarım kalan/stale Storage nesneleri için trafiğe bağlı olmayan periyodik cleanup görevi kuruldu.

Profil ölçüleri ve katalog beden rehberi, önerilen/dar/rahat bedeni deterministik olarak hesaplar. FASHN bu ölçüleri almaz ve sonuç “ürün görünümü” olarak sunulur. Yalnız isteğe bağlı FLUX Beta, seçilen bedeni dar/dengeli/rahat metin talimatına çevirir; ham santimetre, gerçek ürün ölçüsü veya kumaş fiziği simüle etmez. Bu nedenle hiçbir çıktı kesin beden/kalıp doğruluğu değildir.
