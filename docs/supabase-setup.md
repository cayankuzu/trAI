# Supabase kurulumu

## Doğrulanmış yerel durum — 24 Ağustos 2026

- Yerel `.env.local` içinde Project URL, publishable key ve yalnız sunucuda kullanılan `SUPABASE_SECRET_KEY` tanımlıdır. Değerler repoya yazılmamalıdır.
- Uzak projede `001`–`010` migrasyonlarının tamamı uygulanmıştır; `supabase db push --dry-run` bekleyen migration olmadığını doğrulamıştır.
- `user-photos` private bucket limiti 6 MiB’dir. Tarayıcıda doğrudan insert/update/delete politikası yoktur; yükleme yalnız sunucunun verdiği exact-path, append-only imzayla yapılır.
- Brevo SMTP ve gerçek mailbox teslimatı hâlâ panelde manuel doğrulanmalıdır.

## Yeni ortam kurulumu

1. Supabase Dashboard’da bir proje oluşturun.
2. Bu klasörde `npx supabase link --project-ref PROJECT_REF` çalıştırın.
3. `npx supabase db push` ile aşağıdaki migration zincirini dosya adı sırasıyla uygulayın:

   1. `202608200001_initial_schema.sql`
   2. `202608200002_harden_account_deletion.sql`
   3. `202608200003_fal_try_on_pipeline.sql`
   4. `202608200004_atomic_profile_update.sql`
   5. `202608240005_size_aware_try_on_sessions.sql`
   6. `202608240006_harden_size_and_look_updates.sql`
   7. `202608240007_harden_try_on_inputs_and_look_insert.sql`
   8. `202608240008_reconcile_provider_and_stale_uploads.sql`
   9. `202608240009_fix_stale_cleanup_request_id_ambiguity.sql`
   10. `202608240010_weight_and_unlimited_test_mode.sql`

4. Ortam değişkenlerini yalnız ilgili ortamın secret yönetimine ekleyin:

   ```dotenv
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   SUPABASE_SECRET_KEY=sb_secret_your-server-only-key
   FAL_KEY=your-server-only-fal-key
   TRY_ON_UNLIMITED_TEST_MODE=false
   ```

5. `SUPABASE_SECRET_KEY` ve `FAL_KEY` değerlerine hiçbir zaman `NEXT_PUBLIC_` öneki vermeyin.
6. Sunucuyu ortam değişkenlerini ekledikten sonra yeniden başlatın.

## Auth URL ve e-posta ayarları

Supabase Dashboard > Authentication > URL Configuration bölümünde:

- Yerel Site URL: `http://localhost:3000`
- Yerel redirect allow-list: `http://localhost:3000/**`
- Production Site URL ve allow-list: yalnız gerçek production/denetlenen preview adresleri

`/auth/confirm` hem `token_hash` + `verifyOtp` hem de geriye dönük PKCE `code` akışını destekler. Confirm email açık, otomatik onay kapalı ve Secure email change açık tutulmalıdır.

`supabase/templates/confirmation.html` ve `supabase/templates/recovery.html` içerikleri Dashboard şablonlarına uygulanmalıdır. Brevo domain/sender, SPF/DKIM/DMARC ve SMTP kurulumu tamamlanmadan e-posta teslimatı production için doğrulanmış sayılmaz.

## Güvenlik sınırı

- Çerezli Supabase client yalnız kullanıcı claim’ini doğrular.
- Server-only admin client, doğrulanmış kullanıcı kimliğini yalnız `service_role` yetkili RPC’lere geçirir.
- İstemci Storage path’i belirleyemez; batch claim RPC’si kullanıcı/request tabanlı yolu üretir.
- Kaynak upload imzası overwrite yetkisi taşımaz. Dosya sunucuda boyut, magic-byte ve uzantı eşleşmesiyle yeniden doğrulanır.
- `try_on_usage` istemciye kapalıdır; aylık beş sonuç transaction/advisory lock ile sayılır. Belirsiz sağlayıcı submit’i ihtiyatlı biçimde tüketim olarak kalır.
- `provider_cancelled`, sağlayıcı üretimi iptal ettiği için kullanım rezervasyonunu iade eder; `provider_submit_uncertain` olası ücret nedeniyle kotada kalır.
- `008`, kaynak/garment temizlik metadatasını private Storage silme işlemi başarıyla tamamlanana kadar korur. Stale yollar `claim_stale_try_on_cleanup` ile yalnız `service_role` tarafından alınır ve başarılı silmeden sonra `finalize_try_on_input_cleanup` ile temizlenir.
- `009`, canlı kabul testinde ortaya çıkan cleanup RPC `request_id` ad çakışmasını giderir.
- `010`, nullable `weight_kg` profil ölçüsünü ekler. `try_ons.quota_exempt` yalnız `service_role` batch RPC’si tarafından yazılır; yerel test işleri normal aylık/günlük sayaçları kirletmez.
- Doğrudan `looks` insert/update politikaları kaynak session/try-on, kapak ve grup sahipliğini doğrular.
- Hesap silme fotoğraf temizliği başarısızsa Auth kullanıcısını silmez.

## Production kabul listesi

- [x] Uzak migration geçmişi `001`–`010` ve dry-run güncel.
- [x] Geçici kullanıcıyla kilo profil RPC’si, 10’lu muaf batch/idempotent retry, 21 günlük muaf rezervasyon, normal 5/6 kota ve authenticated bypass reddi geçti; fal.ai çağrılmadı.
- [x] Gerçek oturumlu batch upload-intent HTTP 200 kabul testi geçti; Fal çağrılmadı.
- [x] Kota/durum RPC’leri yalnız `service_role`; profil RPC’si yalnız `authenticated`.
- [x] Storage tarayıcı mutation politikaları kapalı; bucket 6 MiB.
- [x] Canlı geçici kullanıcıyla lazy stale cleanup Storage silme/finalize akışı geçti; `authenticated` rolün cleanup RPC çağrısı reddedildi.
- [ ] Vercel preview/production ortam değişkenleri eklendi.
- [ ] Gerçek mailbox ile kayıt doğrulama ve şifre sıfırlama teslim edildi.
- [ ] İki kullanıcıyla RLS negatif yetki testi yapıldı.
- [ ] 6 MiB’a yakın direct signed upload Vercel preview’da geçti.
- [ ] Fal kredisiyle tek gerçek üretim, timeout/retry ve beşinci/altıncı kota davranışı test edildi.
- [ ] Lazy cleanup’a ek olarak yarım kalan upload nesneleri için trafiğe bağlı olmayan periyodik Storage cleanup görevi kuruldu.
- [ ] Hesap silme DB ve Storage verisini uçtan uca temizledi.
