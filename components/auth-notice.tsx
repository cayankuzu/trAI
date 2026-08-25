import Link from "next/link";
import { ButtonLink } from "@/components/button-link";

type AuthNoticeProps = {
  eyebrow: string;
  title: string;
  description: string;
  symbol: string;
  tone: "success" | "error" | "warning" | "neutral";
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  detail?: string;
};

export function AuthNotice({
  eyebrow,
  title,
  description,
  symbol,
  tone,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  detail,
}: AuthNoticeProps) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-notice" aria-labelledby="auth-notice-title">
        <Link className="brand" href="/">trAI</Link>
        <div className={`auth-notice-symbol is-${tone}`} aria-hidden>{symbol}</div>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="auth-notice-title">{title}</h1>
          <p className="lead">{description}</p>
        </div>
        {detail ? <p className="auth-notice-detail">{detail}</p> : null}
        <div className="button-row">
          <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
          {secondaryLabel && secondaryHref ? (
            <ButtonLink href={secondaryHref} variant="secondary">{secondaryLabel}</ButtonLink>
          ) : null}
        </div>
      </section>
    </main>
  );
}

