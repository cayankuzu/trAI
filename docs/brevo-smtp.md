# Brevo SMTP + Supabase Auth

trAI doğrulama, parola sıfırlama ve güvenlik e-postalarını tarayıcıdan göndermez. Supabase Auth bu e-postaları Brevo SMTP üzerinden gönderir; SMTP anahtarı uygulama koduna veya `.env.local` dosyasına eklenmez.

## Mevcut durum

Uygulama rotaları ve `supabase/templates/confirmation.html` ile `supabase/templates/recovery.html` şablonları hazırdır. Brevo sender/domain doğrulaması, SMTP anahtarı, Supabase panel ayarı ve gerçek teslimat testi henüz tamamlanmadı. Bu bölüm panelde doğrulanana kadar production e-posta akışı “hazır” sayılmamalıdır.

## Brevo ön koşulları

1. Transactional e-posta özelliğini etkinleştirin.
2. Production alan adını Brevo’da doğrulayın; SPF/DKIM ve DMARC kayıtlarını tamamlayın.
3. `trAI Supabase Auth` gibi yalnız bu entegrasyona ait ayrı bir SMTP key oluşturun ve parola yöneticisinde saklayın.
4. `no-reply@auth.<alan-adı>` gibi yalnız kimlik doğrulama için kullanılan bir sender adresini doğrulayın.
5. Kimlik doğrulama bağlantılarının yeniden yazılmaması için Brevo click/link tracking özelliğini kapatın.

SMTP key ile Brevo API key aynı şey değildir. Hesap parolası da SMTP password olarak kullanılmamalıdır.

## Supabase SMTP alanları

Supabase Dashboard > Authentication > Emails/SMTP Settings bölümünde:

| Alan | Değer |
| --- | --- |
| Sender name | `trAI` |
| Sender email | Doğrulanmış `no-reply@auth.<alan-adı>` adresi |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | Brevo SMTP & API ekranındaki SMTP login |
| Password | Brevo SMTP key; API key veya hesap parolası değil |

Confirm email açık, Secure email change açık ve otomatik e-posta onayı kapalı kalmalıdır.

## URL ve şablon ayarları

- Yerel Site URL: terminalde kullanılan porta göre `http://localhost:3000` veya `http://localhost:3001`
- Yerel redirect allow-list: ilgili origin için `/**`
- Production Site URL: gerçek custom domain/deployment URL’si
- Production ve yalnız gerekiyorsa preview adresleri redirect allow-list’e eklenir
- `confirmation.html`: Authentication > Email Templates > Confirm signup
- `recovery.html`: Authentication > Email Templates > Reset password

Şablonlar `{{ .RedirectTo }}` ve `{{ .TokenHash }}` kullanır. `/auth/confirm` token hash’i doğrular; eski PKCE code bağlantıları için fallback de vardır.

## Gerçek teslimat kabul testi

- [ ] Brevo alan adı ve sender doğrulandı; SPF/DKIM/DMARC sağlıklı.
- [ ] SMTP ayarı Supabase panelinde kaydedildi; secret hiçbir dosyaya yazılmadı.
- [ ] Yeni kayıt sonrası oturum açılmadan `/verify-email` ekranı gösterildi.
- [ ] Doğrulama e-postası gelen kutusuna ulaştı ve bağlantı `/email-verified` sonucuna gitti.
- [ ] Yeniden gönderim cooldown/rate limit davranışı kontrol edildi.
- [ ] Şifre sıfırlama isteği hesap varlığını açığa çıkarmadı.
- [ ] Kurtarma bağlantısı `/reset-password` akışını açtı; tek kullanımlık/süre aşımı davranışı doğrulandı.
- [ ] Eski veya geçersiz bağlantı özel hata ekranına gitti.
- [ ] Yeni şifre ve tekrarı eşleşmeden güncelleme yapılmadı.
- [ ] Brevo Transactional Logs üzerinde delivered, bounced ve rejected kayıtları incelendi.
- [ ] Gmail, Outlook ve mümkünse kurumsal bir mailbox’ta teslimat/spam kontrol edildi.

