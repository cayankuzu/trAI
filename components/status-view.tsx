import { ButtonLink } from "@/components/button-link";
import type { StatusState } from "@/lib/types";

export function StatusView({ state }: { state: StatusState }) {
  return (
    <section className="status-layout" aria-labelledby="status-title">
      <div className="status-copy">
        <div className={`status-symbol tone-${state.tone}`} aria-hidden>
          {state.symbol}
        </div>
        <p className={`eyebrow tone-text-${state.tone}`}>{state.eyebrow}</p>
        <h1 id="status-title">{state.title}</h1>
        <p className="lead">{state.description}</p>
        <div className="info-card status-trust-card">
          <h2>{state.detailTitle}</h2>
          <p>{state.detailText}</p>
        </div>
      </div>
      <div className="status-actions-panel">
        <dl className="detail-list">
          <div>
            <dt>İşlem kodu</dt>
            <dd>{state.code}</dd>
          </div>
          <div>
            <dt>Durum</dt>
            <dd>{state.eyebrow}</dd>
          </div>
          <div>
            <dt>Bilgi</dt>
            <dd>{state.detailTitle}</dd>
          </div>
        </dl>
        <div className="button-row">
          <ButtonLink href={state.primaryHref}>{state.primaryLabel}</ButtonLink>
          {state.secondaryHref && state.secondaryLabel ? (
            <ButtonLink href={state.secondaryHref} variant="secondary">
              {state.secondaryLabel}
            </ButtonLink>
          ) : null}
        </div>
        <div className="support-card">
          <div>
            <h2>Bir sorun mu var?</h2>
            <p>İşlem kodunu paylaşarak destek ekibinden yardım alabilirsin.</p>
          </div>
          <ButtonLink href="/support" variant="secondary">
            Destek merkezi
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
