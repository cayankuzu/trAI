"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="simple-state"><p className="eyebrow">BEKLENMEYEN HATA</p><h1>Bir şeyler ters gitti</h1><p>Sayfayı yeniden yükleyebilir veya biraz sonra tekrar deneyebilirsin.</p><button className="button button-primary" type="button" onClick={reset}>Yeniden dene</button></main>;
}
