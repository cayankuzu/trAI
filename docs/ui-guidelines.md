# UI/UX kısa rehberi

Bu belge junior veya stajyer tasarımcının projeyi tutarlı biçimde sürdürebilmesi için hazırlanmıştır.

## Temel ilkeler

- Önce telefon düzenini çözün; tablet ve bilgisayarda alanı yeniden dağıtın.
- Aynı ekranın cihaz sürümlerinde bilgi sırası ve aksiyon isimleri aynı kalmalıdır.
- Telefon/tablette navigasyon altta, bilgisayarda üstte görünür; ikon ve etiketler değişmez.
- Birincil aksiyon bordo, ikincil aksiyon beyaz ve çerçeveli kullanılır.
- Dokunulabilir kontroller hiçbir cihazda 44×44 px altına düşmemelidir.
- İçerik geniş ekranda sınırsız büyümez; ana içerik 1200 px içinde tutulur.

## Tasarım tokenları

- Marka: `#941F43`
- Ana metin: `#121418`
- İkincil metin: `#555D68`
- Çerçeve: `#DCE0E5`
- Hafif yüzey: `#F7F8FA`
- Küçük radius: `12px`, kart radius: `16px`, vurgu radius: `22px`

Tokenların kod karşılığı `app/globals.css` dosyasının başındaki `:root` alanındadır.

## Ekran kontrolü

Yeni bir ekran eklerken telefon, tablet ve bilgisayarda şunları karşılaştırın:

1. Başlık, açıklama ve aksiyon sırası aynı mı?
2. Metin veya kart kesiliyor mu?
3. Ana aksiyon görünür ve anlaşılır mı?
4. Navigasyon doğru aktif sekmeyi gösteriyor mu?
5. Boş, yükleniyor, başarı ve hata durumları mevcut mu?
