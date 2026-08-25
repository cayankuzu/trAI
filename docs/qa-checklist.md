# Yayın öncesi QA listesi

Bu liste “kod mevcut” ile “gerçek ortamda doğrulandı” durumlarını ayırır. İşaretli maddeler yalnız belirtilen kanıt düzeyinde tamamlanmıştır; panel, e-posta, gerçek fal.ai ve cihaz testleri işaretlenmeden production yayını yapılmamalıdır.

## Yerel otomasyon

- [x] `npm run typecheck` final kod ağacında yeniden çalıştırıldı.
- [x] Son doğrulanmış `npm test` çalışması 38 test dosyasında 239 testi geçirdi.
- [x] `npm run build` final kod ağacında geçti; Next.js 16.3.1 çıktısında 46 sayfa girdisi üretildi.
- [x] `npm audit --audit-level=high` final kod ağacında 0 güvenlik açığıyla geçti.
- [x] Ana/auth/uygulama/yasal rotaların yerel HTTP smoke matrisi geçti; public rotalar 200, oturumsuz korumalı rotalar 307 `/login` döndürdü.
- [x] Eski `demo:true` prova payload’ı HTTP 400 `invalid_request` döndürdü; sahte sonuç veya kimlik/kota bypass’ı üretmedi.
- [x] Geçersiz JSON/ürün kimliği 400; oturumsuz gerçek prova ve upload-intent 401 döndürdü.
- [x] Gerçek kullanıcı oturumuyla upload-intent HTTP 200 döndürdü; test rezervasyonu fal.ai çağrılmadan temizlenip kota 1’den 0’a döndürüldü.
- [x] Geçici kullanıcıyla uzak DB’de normal 5 istek alındı, 6. istek atomik `quota_exceeded` döndürdü; yerel test batch’i fal.ai çağrılmadan 10 sonuç rezerve etti.

## Responsive ve görsel

- [x] 390×844 telefon görünümünde kilo/prova test modu akışında yatay taşma veya hata overlay’i yok.
- [ ] 834×1194 tablet görünümünde içerik genişliği, alt navigasyon ve karşılaştırma alanı doğru.
- [ ] 1512×982 bilgisayar görünümünde üst navigasyon, kolonlar ve maksimum içerik genişliği doğru.
- [ ] Ara genişliklerde tek responsive sistem kırılmadan çalışıyor; yalnız üç sabit mockup’a bağlı değil.
- [ ] Uzun Türkçe metinler ve hata mesajları kart sınırlarını aşmıyor.
- [ ] Önce/sonra görselleri doğru oran/odakla gösteriliyor; tam vücut gereksiz kırpılmıyor.
- [ ] Yükleme ve fal.ai bekleme sırasında tüm ilgili input/aksiyonlar tutarlı biçimde kilitleniyor.
- [ ] Chrome, Safari/WebKit ve Firefox güncel sürümlerinde temel akış test edildi.

## Auth ve e-posta

- [x] Kayıt, doğrulama sonucu, yeniden gönderim, parola kurtarma, geçersiz bağlantı, başarı ve oturum içi parola değiştirme rotaları kodda mevcut.
- [x] `/auth/confirm`, `token_hash`/`verifyOtp` ve PKCE `code` fallback’ini kodda destekliyor.
- [x] Supabase public Auth ayarlarında e-posta ile kayıt açık ve auto-confirm kapalı (`/auth/v1/settings`, 20 Ağustos 2026).
- [ ] Supabase Dashboard'da Secure email change ayarı açık.
- [ ] `confirmation.html` ve `recovery.html` uzak Supabase projesine uygulandı.
- [ ] Brevo domain/sender, SPF/DKIM/DMARC ve SMTP ayarı tamamlandı.
- [ ] Kayıt doğrulama e-postası gerçek mailbox’ta teslim edildi ve hesap aktifleşti.
- [ ] Yeniden gönderim, cooldown/rate limit ve hesap varlığını açığa çıkarmayan kurtarma davranışı doğrulandı.
- [ ] Geçerli, süresi dolmuş ve tekrar kullanılan parola bağlantıları test edildi.
- [ ] Oturum süresi dolması ve güvenli çıkış gerçek Supabase oturumuyla test edildi.

## Fotoğraf, Supabase ve fal.ai

- [x] İstemci/sunucu JPG, PNG ve WebP türlerini dosya başına 6 MiB ile sınırlar.
- [x] `FAL_KEY` server-only okunur; `NEXT_PUBLIC_` istemci anahtarı yoktur.
- [x] `SUPABASE_SECRET_KEY` için `server-only` admin client oturum kalıcılığı/yenilemesi kapalı biçimde kodlanmıştır.
- [x] Kota/durum RPC’leri yalnız `service_role` execute grant’i ve sunucunun verdiği `p_user_id` ile tasarlanmıştır; authenticated Storage insert/update politikası yoktur.
- [x] Ana prova API’si istemciden Storage path’i kabul etmez; `requestId` ile DB-owned path okur.
- [x] Yüklenen private dosya sunucuda boyut, magic-byte ve DB path uzantısı eşleşmesiyle yeniden doğrulanır.
- [x] fal.ai payload saklama `X-Fal-Store-IO: 0` ile kapatılmış, CDN çıktısı 10 dakikalık yaşam süresiyle sınırlandırılmış ve sonuç private Storage’a kopyalanacak şekilde kodlanmıştır.
- [x] fal.ai queue submit `POST` isteği istemci tarafında otomatik tekrarlanmaz; belirsiz submit ayrı terminal hata olarak ele alınır.
- [x] Uzak Supabase projesine `001`–`010` migrasyonları uygulandı ve dry-run bekleyen migration göstermedi.
- [x] `007`, kombin insert/update için kaynak session/try-on/kapak/grup sahipliğini, exact-path append-only upload’ı ve 6 MiB private bucket sınırını sertleştirir.
- [x] Belirsiz provider submit’i olası ücret nedeniyle kotada kalır; stale claim suistimaline karşı kullanıcı başına günlük yeni rezervasyon sayısı 20 ile sınırlıdır.
- [x] `008`, Storage silme tamamlanana kadar cleanup metadatasını korur; `provider_cancelled` kotayı iade eder, `provider_submit_uncertain` olası ücret nedeniyle kotada kalır.
- [x] `008` service-only lazy stale cleanup ve `009` `request_id` hotfix’i canlı geçici kullanıcıyla geçti; `authenticated` rolün cleanup RPC çağrısı reddedildi.
- [x] `010` kilo profil RPC’si ve server-owned test muafiyeti canlı geçici kullanıcıyla geçti; 10’lu retry idempotent, 21. günlük muaf istek açık, authenticated bypass kapalıdır.
- [x] `SUPABASE_SECRET_KEY=sb_secret_...` yerel server ortamına güvenli biçimde eklendi ve gerçek upload-intent 503 engelini geçti.
- [ ] `SUPABASE_SECRET_KEY` Vercel preview/production server ortamlarına ayrıca eklendi.
- [ ] RLS/RPC/Storage policy’leri iki gerçek test kullanıcısıyla negatif yetki testinden geçti.
- [ ] 6 MiB’a yakın dosya Vercel Function body’sine girmeden direct signed upload ile yüklendi.
- [x] API-scope `FAL_KEY` yerel server ortamına eklendi; tarayıcıya açılmıyor.
- [ ] Vercel preview/production `FAL_KEY` eklendi ve fal.ai hesabında kredi var.
- [ ] Gerçek kişi + kontrollü katalog görseli ile fal.ai sonucu alındı.
- [ ] Provider başarısızlığı, 170 saniyelik istemci bekleme sınırı, retry ve aynı `requestId` devamı doğrulandı.
- [ ] Aylık beş hakkın eşzamanlı istek yarışı ayrıca doğrulanmalı; tekil normal akışta beş hak ve altıncı isteğin reddi gerçek DB üzerinde geçti.
- [x] Başarı/terminal hata sonrası anlık temizlik ile sonraki upload-intent’te çalışan lazy stale cleanup yolu kod ve canlı kabul testiyle doğrulandı.
- [ ] Lazy cleanup’a ek olarak yarım kalan/stale upload nesneleri için trafiğe bağlı olmayan periyodik cleanup görevi kuruldu.

## Güvenlik ve kötüye kullanım

- [x] İstemci yalnız katalog ürün kimliği gönderir; sunucu kıyafet görselini kontrollü yerel katalogdan çözer.
- [x] Signed upload yolu kullanıcı/request/kind ile veritabanı tarafından sahiplenilecek şekilde tasarlanmıştır.
- [ ] CSP, clickjacking, nosniff, referrer ve permissions başlıkları deployment üzerinde kontrol edildi.
- [ ] Dağıtık maliyet/kota alarmı ve anomali izleme kuruldu.
- [ ] Secret taraması ve Vercel/Supabase/fal.ai/Brevo anahtar rotasyonu prosedürü doğrulandı.
- [ ] Hata yanıtları kişisel veri, provider secret veya iç path sızdırmıyor.

## Erişilebilirlik

- [ ] Yalnız klavye ile kayıt → giriş → prova → kaydetme akışı tamamlanabiliyor.
- [ ] Focus görünümü, modal/focus sırası ve hata sonrası odak yönetimi doğru.
- [ ] Form hataları yalnız renge bağlı değil ve alanlarla programatik ilişkili.
- [ ] Anlamlı görseller açıklayıcı alt metne; dekoratif görseller boş alt metne sahip.
- [ ] Renk kontrastı axe/Lighthouse ve manuel kontrolle doğrulandı.
- [ ] Ekran okuyucuyla yükleme durumu, üretim sonucu ve hata mesajları anlaşılır.

## Veri, hukuk ve operasyon

- [ ] Hesap silme gerçek Supabase kullanıcısı için DB ve Storage verisini tamamen sildi; hata halinde hesabı korudu.
- [ ] Veri saklama süreleri, yarım kalan upload temizliği ve kullanıcı talebi prosedürü belirlendi.
- [ ] KVKK, gizlilik ve kullanım koşulları gerçek tüzel kişi/iletişim/alt işleyen bilgileriyle hukuk kontrolünden geçti.
- [ ] fal.ai, Supabase, Brevo ve Vercel veri işleme/aktarım rolleri hukuki metinlerde doğru açıklandı.
- [ ] Vercel environment variables preview ve production için tanımlandı.
- [ ] Custom domain ve HTTPS çalışıyor; Supabase redirect allow-list güncel.
- [ ] Hata izleme, yapılandırılmış log, uptime ve maliyet alarmı bağlı.
- [ ] Destek taleplerini yanıtlayacak yetkili süreç ve iletişim adresi tanımlı.
