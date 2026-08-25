import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="simple-state">
      <p className="eyebrow">BAĞLANTI YOK</p>
      <h1>İnternete bağlanamadık</h1>
      <p>Bu çevrimdışı bilgi ekranı kullanılabilir; hesap verileri ve yeni prova için bağlantını yeniden kur.</p>
      <Link className="button button-primary" href="/try-on">Tekrar dene</Link>
    </main>
  );
}
