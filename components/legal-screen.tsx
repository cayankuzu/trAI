import Link from "next/link";
import type { ReactNode } from "react";

type LegalScreenProps = {
  code: string;
  title: string;
  intro: string;
  active: "kvkk" | "privacy" | "terms";
  children: ReactNode;
};

const legalLinks = [
  { key: "kvkk", label: "KVKK Aydınlatma", href: "/legal/kvkk" },
  { key: "privacy", label: "Gizlilik Politikası", href: "/legal/privacy" },
  { key: "terms", label: "Kullanım Koşulları", href: "/legal/terms" },
] as const;

export function LegalScreen({ code, title, intro, active, children }: LegalScreenProps) {
  return (
    <div className="legal-page">
      <header className="public-header">
        <Link className="brand" href="/">
          trAI
        </Link>
        <span className="route-code">{code}</span>
      </header>
      <div className="legal-layout">
        <aside className="legal-sidebar" aria-label="Yasal metinler">
          <p className="eyebrow">YASAL MERKEZ</p>
          <p>Metinler arasında geçiş yapabilir ve sayfayı kaydırabilirsin.</p>
          <nav>
            {legalLinks.map((item) => (
              <Link
                href={item.href}
                key={item.key}
                aria-current={active === item.key ? "page" : undefined}
                className={active === item.key ? "is-active" : ""}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="legal-content">
          <p className="legal-updated">Son güncelleme · 20 Ağustos 2026</p>
          <h1>{title}</h1>
          <p className="lead">{intro}</p>
          <div className="legal-mobile-tabs" aria-label="Yasal metinler">
            {legalLinks.map((item) => (
              <Link
                href={item.href}
                key={item.key}
                aria-current={active === item.key ? "page" : undefined}
                className={active === item.key ? "is-active" : ""}
              >
                {item.label.replace(" Politikası", "").replace(" Aydınlatma", "")}
              </Link>
            ))}
          </div>
          <div className="legal-sections">{children}</div>
        </article>
      </div>
      <footer className="legal-footer">
        <span>trAI yasal ve gizlilik merkezi</span>
        <Link className="button button-secondary" href="/settings">
          Gizlilik merkezine dön
        </Link>
      </footer>
    </div>
  );
}
