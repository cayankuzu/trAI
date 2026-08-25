# Sayfa ve rota haritası

## Kullanıcı arayüzü

| Rota | Amaç | Erişim/not |
| --- | --- | --- |
| `/` | Ürünü açıklar ve ana aksiyonları sunar | Herkese açık |
| `/login` | E-posta/şifre ile giriş | Herkese açık |
| `/signup` | Ad, e-posta, cinsiyet ve şifre ile kayıt | Herkese açık |
| `/verify-email` | Kayıt sonrası doğrulama e-postası yönlendirmesi ve yeniden gönderim | Herkese açık |
| `/email-verified` | Başarılı e-posta doğrulama sonucu | Bağlantı sonrası |
| `/email-verification-failed` | Geçersiz/süresi dolmuş doğrulama bağlantısı | Bağlantı sonrası |
| `/forgot-password` | Parola sıfırlama e-postası talebi | Herkese açık |
| `/forgot-password/sent` | Hesap varlığını açığa çıkarmayan gönderim sonucu | Herkese açık |
| `/reset-password` | Kurtarma oturumuyla yeni parola belirleme | Geçerli kurtarma bağlantısı |
| `/reset-password/invalid` | Geçersiz/süresi dolmuş kurtarma bağlantısı | Bağlantı sonrası |
| `/password-changed` | Parola değiştirme başarı sonucu | İşlem sonrası |
| `/change-password` | Oturum içinden parola değiştirme | Sunucuda oturum kontrolü |
| `/try-on` | Katalog ürünü seçimi, kişi fotoğrafı yükleme ve sonuç karşılaştırması | Gerçek prova için Supabase oturumu gerekir; sahte/demo sonuç yolu yoktur |
| `/looks` | İsimli/gruplu kombinleri listeleme, genişletme, yeniden adlandırma/gruplama ve silme | Sunucu oturumu gerekir; demo veri yolu yoktur |
| `/profile` | Profil, vücut ölçüleri, üst beden ve EU/W pantolon bedenini düzenleme | Sunucu oturumu gerekir |
| `/settings` | Güvenlik, gizlilik, kota ve hesap silme bağlantıları | Sunucu oturumu gerekir |
| `/support` | SSS ve destek formu | Supabase modunda sunucu oturumu gerekir; API ayrıca oran sınırlamalı |
| `/states/[slug]` | Hata, başarı, kota ve boş durum ekranları | Duruma göre |
| `/legal/kvkk` | KVKK aydınlatma taslağı | Herkese açık; hukuk onayı bekliyor |
| `/legal/privacy` | Gizlilik taslağı | Herkese açık; hukuk onayı bekliyor |
| `/legal/terms` | Kullanım koşulları taslağı | Herkese açık; hukuk onayı bekliyor |
| `/offline` | Çevrimdışı geri dönüş ekranı | Herkese açık |

## Sistem ve API rotaları

| Rota | Yöntem/amaç | Erişim/not |
| --- | --- | --- |
| `/auth/confirm` | Supabase `token_hash` doğrulaması veya PKCE code exchange | Sistem callback’i |
| `/api/health` | Deployment sağlık yanıtı | Teknik/herkese açık |
| `/api/try-ons/upload-intent` | Kullanıcıya özel lazy stale cleanup, kota claim’i ve exact-path imzalı Supabase yükleme izni | Supabase oturumu + server-only secret’lar gerekir; cleanup RPC’leri yalnız `service_role` |
| `/api/try-ons` | fal.ai prova üretimi | Supabase oturumu ve önceden alınmış güvenli upload-intent gerekir |
| `/api/looks` | Kombin listeleme/kaydetme/yeniden adlandırma-gruplama/silme | Doğrulanmış kullanıcı; `007` sahiplik politikalarıyla korunur |
| `/api/look-groups` | Kombin grubu listeleme/oluşturma/yeniden adlandırma/silme | Doğrulanmış kullanıcı ve sahiplik kontrolü |
| `/api/profile` | Profil, ölçü ve varsayılan bedenleri okuma/güncelleme | Doğrulanmış kullanıcı |
| `/api/support` | Destek talebi | Oran sınırlamalı |
| `/api/account` | Hesap ve ilişkili verileri silme | Doğrulanmış kullanıcı; `002` migrasyonu gerekir |

`/try-on`, `/looks`, `/profile`, `/settings`, `/support`, `/change-password` ve uygulama içi hata/kota durumları Proxy katmanında erken `/login` yönlendirmesi yapar. Bu yalnızca iyimser bir kullanıcı deneyimi kontrolüdür; `AppShell`, Route Handler ve Supabase RLS/RPC katmanlarındaki asıl yetkilendirme ayrıca korunur.
