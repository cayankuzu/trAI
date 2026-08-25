# Supabase e-posta şablonları

- `confirmation.html`: Supabase Dashboard → Authentication → Email Templates → Confirm signup alanına yapıştırılır.
- `recovery.html`: Supabase Dashboard → Authentication → Email Templates → Reset password alanına yapıştırılır.

Her iki şablon da SSR uyumlu özel callback bağlantısını `{{ .RedirectTo }}` ve `{{ .TokenHash }}` değişkenleriyle üretir. `/auth/confirm` rotası token hash'i `verifyOtp` ile doğrular; geriye dönük PKCE bağlantıları için `code` değişimini de destekler. Brevo SMTP ayarı Supabase Dashboard → Project Settings → Authentication → SMTP Settings bölümünde ayrıca yapılır; SMTP parolası veya Brevo API anahtarı repoya eklenmez.

Brevo'da **click tracking / link tracking kapalı tutulmalıdır**. Supabase, harici e-posta sağlayıcısının bağlantıyı yeniden yazmasının doğrulama akışını bozabileceğini belirtir. Kurumsal e-posta güvenlik sistemlerinin bağlantı önizleme/prefetch özelliği kullanılacaksa doğrudan bağlantı yerine kullanıcı tıklamasını bekleyen ara onay sayfası veya e-posta OTP akışı değerlendirilmelidir.

Önerilen konu satırları:

- Kayıt doğrulama: `trAI hesabını doğrula`
- Şifre yenileme: `trAI şifreni yenile`
