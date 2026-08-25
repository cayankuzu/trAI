# Doğrulama raporu

**Rapor tarihi:** 25 Ağustos 2026  
**Kapsam:** Ürün-sadakati varsayılanı, deneysel beden görünümü ayrımı, katalog referans hazırlığı, kilo profili, yerel sınırsız test modu ve uzak RPC kabul testlerinden sonraki kod ağacı  
**Temel kullanıcı hikâyesi:** Kullanıcı kayıt olup e-postasını doğrular; kontrollü katalogdan kıyafet seçip kişi fotoğrafını private Supabase Storage’a doğrudan yükler; fal.ai sanal prova üretir; kullanıcı önce/sonra sonucunu karşılaştırıp kombinlerine kaydeder.

## Sonuç özeti

Kod düzeyinde auth ekranları, Supabase veri katmanı, server-only secret-key güven sınırı, direct signed upload ve iki amaçlı fal.ai queue entegrasyonu bulunuyor: FASHN v1.6 varsayılan ürün aktarımı, FLUX 2 LoRA ise yalnız açık Beta beden görünümü. Uzak `001`–`010` migrasyonları uygulanmış ve dry-run günceldir. Canlı FLUX çıktıları ürün deseni/dokusu açısından karşılaştırılmış; bu kanıt varsayılanın FASHN’e alınmasına yol açmıştır. Yeni FASHN varsayılanının sabit kabul seti, Vercel ortam/deploy ve Brevo SMTP mailbox teslimatı tamamlanmadığı için production hazır sonucu verilmemiştir.

## Kanıt matrisi

| Sınır | Durum | Mevcut kanıt / eksik kanıt |
| --- | --- | --- |
| Sayfa ve API yüzeyi | Kod incelemesi geçti | Auth sonuç rotaları, uygulama/yasal sayfalar, `/api/try-ons/upload-intent` ve `/api/try-ons` mevcut |
| E-posta doğrulama callback’i | Kod incelemesi geçti | `verifyOtp(token_hash, type)` ve PKCE `exchangeCodeForSession(code)` fallback’i mevcut |
| Supabase kayıt politikası | Canlı public ayar kontrolü geçti | E-posta ile kayıt açık, signup açık ve `mailer_autoconfirm=false`; Secure email change panel doğrulaması bekliyor |
| Parola akışları | Kod incelemesi geçti | Talep, gönderildi, reset, geçersiz bağlantı, değiştirildi ve oturum içi change-password ekranları mevcut |
| Vercel upload sınırı | Mimari düzeltme kodlandı | Fotoğraflar 4,5 MB Function body’sinden geçirilmeden signed token ile doğrudan private Supabase Storage’a gider; gerçek Vercel preview testi bekliyor |
| Dosya doğrulama | Kod incelemesi geçti | JPG/PNG/WebP, dosya başına 6 MiB; private dosyada boyut, magic-byte ve DB path uzantısı eşleşmesi kontrolü |
| Secret-key sınırı | Yerel kabul testi geçti | Çerezli client yalnız claim doğrular; ayrı oturumsuz admin client `SUPABASE_SECRET_KEY` kullanır ve gerçek oturumlu upload-intent 200 döndürdü |
| Storage path sahipliği | Kod ve uzak migrasyon doğrulandı | İstemci path göndermez; authenticated insert/update/delete policy yoktur; secret client exact-path, append-only signed token üretir; bucket sınırı 6 MiB’dir |
| fal.ai sağlayıcı hattı | Kod, birim test ve sınırlı canlı karşılaştırma mevcut | FASHN `quality`, görünüm bazlı flat-lay/model türü ve PNG varsayılan; yüksek çözünürlüklü sabit ürün referansı + yerel fallback kullanılır. FLUX yalnız Beta. Queue submit/status/result, timeout ve hata eşleme mevcut. Yeni FASHN varsayılanı sabit kabul görselleriyle ayrıca doğrulanmalı |
| Kota/idempotency | Gerçek DB kabul testi geçti | Normal 5 hak alındı ve 6. reddedildi; 10’lu test retry’sı idempotent kaldı. Test kayıtları server-owned `quota_exempt` ile aylık/günlük normal sayaçtan ayrılır; tarayıcı bypass RPC’sine erişemez. Eşzamanlı yarış testi ayrıca bekliyor |
| Sonuç güvenliği | Kod incelemesi geçti | Provider payload saklama kapalı ve CDN çıktısı 10 dakikalık yaşam süresiyle istenir; çıktı doğrulanıp private Storage’a kopyalanır ve kısa ömürlü imzalı URL döner. Gerçek provider testi bekliyor |
| Supabase RLS/RPC | Uzak şema doğrulandı | `001`–`010` kayıtlı ve dry-run güncel; kota/durum/cleanup RPC’leri `service_role`, kilo dahil profil güncelleme RPC’si `authenticated` sınırında. `010` test muafiyetini yalnız server-owned satırda tutar |
| Lazy Storage cleanup | Canlı kabul testi geçti | `008` yolları Storage silme başarılı olana kadar DB’de tutar; sonraki upload-intent sınırlı stale batch’i silip finalize eder. Geçici kullanıcı testi geçti ve `authenticated` doğrudan RPC çağrısı reddedildi; periyodik schedule henüz kurulmadı |
| Beden önerisi ve görsel fark | Kod düzeyinde ayrıştırıldı | FASHN ürün görünümü beden simülasyonu değildir; öneri profil ve katalog rehberinden deterministik hesaplanır. FLUX Beta yalnız dar/dengeli/rahat metin talimatıyla yaklaşık görsel üretir |
| Brevo SMTP | Bekliyor | Şablon dosyaları hazır; domain/sender/SMTP panel ayarı ve mailbox teslimatı yapılmadı |
| Responsive UI | Manuel yeniden test bekliyor | Üç referans genişliği tasarımda hedefleniyor; bu turda bağlı tarayıcıyla görsel regresyon/taşma kanıtı alınmadı |
| Erişilebilirlik | Manuel/otomatik yeniden test bekliyor | Güncel birleşik kod için axe, klavye ve ekran okuyucu kanıtı yok |
| Hukuk ve operasyon | Bekliyor | Metinler taslak; hukuk onayı, monitoring, retention ve destek operasyonu yok |

## Yerel otomasyon

Final birleşik kod ağacı yerel komutlar ve tarayıcı kabul kontrolüyle yeniden doğrulandı:

| Komut | Son birleşik sonuç |
| --- | --- |
| `npm run typecheck` | Geçti |
| `npm test` | Geçti — 38 test dosyası, 239 test |
| `npm run build` | Geçti — Next.js 16.3.1, 46 statik/dinamik sayfa girdisi |
| `npm audit --audit-level=high` | Geçti — 0 güvenlik açığı |
| Public/protected sayfa HTTP matrisi | Geçti — public rotalar 200; oturumsuz korumalı uygulama rotaları 307 `/login` |
| `GET /api/health` | Geçti — HTTP 200 |
| Eski `demo:true` `POST /api/try-ons` | Güvenli biçimde reddedildi — HTTP 400 `invalid_request`, sahte sonuç yok |
| Gerçek oturumlu `POST /api/try-ons/upload-intent` | Geçti — HTTP 200; fal.ai çağrılmadan test kota kaydı temizlendi |
| Canlı lazy stale cleanup + ACL | Geçti — geçici kullanıcı nesnesi silindi/finalize edildi; `authenticated` cleanup RPC çağrısı reddedildi |
| Kilo + yerel sınırsız test modu | Geçti — 72 kg yenilemede korundu; 10 çıktı arayüzde açık, eski 5 uyarısı yok; normal DB kotası 5/6 çalışıyor |
| Tarayıcı smoke | Geçti — ana sayfa/profil/prova içerikli; hata overlay/konsol hatası yok; 390×844 görünümde yatay taşma yok |
| Geçersiz JSON/ürün ve oturumsuz gerçek API | Geçti — 400/400/401; upload-intent 401 |

## Production’ı bloke eden doğrulamalar

1. `SUPABASE_SECRET_KEY` ve `FAL_KEY` Vercel preview/production ortamlarına yalnız server-side olarak eklenmeli.
2. fal.ai kredisi yüklenmeli ve gerçek kişi/katalog görselleriyle başarı, timeout, retry ve kota akışları test edilmeli.
3. Brevo domain/sender ve SMTP Supabase’e bağlanmalı; doğrulama/kurtarma e-postaları gerçek mailbox’larda test edilmeli.
4. Vercel ortam değişkenleri eklenip preview/production deploy yapılmalı; 6 MiB’a yakın direct upload, function duration ve private sonuç erişimi deployment üzerinde doğrulanmalı.
5. Telefon, tablet ve bilgisayar referanslarında görsel regresyon, klavye, axe/Lighthouse ve gerçek cihaz testleri yapılmalı.
6. Canlı kabul testinden geçen lazy cleanup’a ek olarak yarım kalan/stale Storage nesneleri için trafiğe bağlı olmayan periyodik cleanup görevi kurulmalı; hesap silme, geniş RLS negatif yetki ve eşzamanlı kota yarış testleri gerçek Supabase üzerinde geçmeli.
7. Hukuki metinler ve veri saklama/alt işleyen açıklamaları uzman onayından geçmeli; monitoring ve maliyet alarmı eklenmeli.

Final yayın kararı [qa-checklist.md](qa-checklist.md) tamamlanmadan verilmemelidir.
