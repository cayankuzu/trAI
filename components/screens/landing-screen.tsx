import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";

export function LandingScreen() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="brand" href="/">
          trAI
        </Link>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">AI DESTEKLİ SANAL PROVA</p>
          <h1>Bir ürünü satın almadan önce üzerinde gör.</h1>
          <p className="lead">
            Katalogdan ürününü seç ve fotoğrafını ekle; görsel provayı karşılaştır, sonucu kaydet
            ve kombinlerini tek yerde yönet.
          </p>
          <div className="button-row landing-cta">
            <ButtonLink href="/signup">İlk provanı oluştur</ButtonLink>
            <ButtonLink href="#how-title" variant="secondary">
              Nasıl çalıştığını gör
            </ButtonLink>
          </div>
          <ul className="trust-points" aria-label="trAI avantajları">
            <li>Fotoğrafların özel depolamada korunur</li>
            <li>Sonuçlarını karşılaştırabilirsin</li>
            <li>Telefon, tablet ve bilgisayarda çalışır</li>
          </ul>
        </div>
        <div className="landing-image">
          <Image
            src="/images/trai-fashion-hero.png"
            alt="Kırmızı ceket ve mavi etekle sanal prova örneği"
            fill
            priority
            sizes="(max-width: 767px) 100vw, 50vw"
          />
          <div className="result-badge">
            <strong>Görsel prova</strong>
            <span>Örnek prova sonucu</span>
          </div>
        </div>
      </section>
      <section className="landing-steps" aria-labelledby="how-title">
        <p className="eyebrow">NASIL ÇALIŞIR?</p>
        <h2 id="how-title">Üç basit adım</h2>
        <div className="step-grid">
          <article><span>01</span><h3>Ürününü seç</h3><p>Kontrollü katalogdan denemek istediğin kıyafeti seç.</p></article>
          <article><span>02</span><h3>Fotoğrafını ekle</h3><p>Net ve tüm vücudunun göründüğü bir fotoğraf seç.</p></article>
          <article><span>03</span><h3>Sonucu karşılaştır</h3><p>AI prova sonucunu incele, kaydet veya yeni ürün dene.</p></article>
        </div>
      </section>
    </main>
  );
}
