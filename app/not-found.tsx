import { ButtonLink } from "@/components/button-link";

export default function NotFound() {
  return <main className="simple-state"><p className="eyebrow">404</p><h1>Bu sayfa bulunamadı</h1><p>Bağlantı değişmiş veya sayfa kaldırılmış olabilir.</p><ButtonLink href="/">Ana sayfaya dön</ButtonLink></main>;
}
