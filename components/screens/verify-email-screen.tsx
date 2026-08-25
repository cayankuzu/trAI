"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { checkVerificationEmailStatus, resendVerificationEmail } from "@/app/auth/actions";
import { initialAuthState } from "@/lib/auth-state";

type VerifyEmailScreenProps = {
  maskedEmail: string | null;
  initialRetryAfter: number;
};

export function VerifyEmailScreen({
  maskedEmail,
  initialRetryAfter,
}: VerifyEmailScreenProps) {
  const [state, formAction, pending] = useActionState(
    resendVerificationEmail,
    initialAuthState,
  );
  const [checkState, checkFormAction, checkPending] = useActionState(
    checkVerificationEmailStatus,
    initialAuthState,
  );
  const [seconds, setSeconds] = useState(initialRetryAfter);

  useEffect(() => {
    const nextSeconds = state.retryAfter ?? initialRetryAfter;
    setSeconds(nextSeconds);
    if (nextSeconds <= 0) return;

    const interval = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [initialRetryAfter, state]);

  const visibleMessage = checkState.message || state.message;
  const messageClass = checkState.message
    ? `form-message is-${checkState.status}`
    : state.message
      ? `form-message is-${state.status}`
      : "";

  return (
    <main className="auth-page">
      <section className="auth-card auth-notice" aria-labelledby="verify-title">
        <Link className="brand" href="/">trAI</Link>
        <div className="auth-notice-symbol is-neutral" aria-hidden>✉</div>
        <div>
          <p className="eyebrow">SON BİR ADIM</p>
          <h1 id="verify-title">E-postanı doğrula</h1>
          <p className="lead">
            {maskedEmail
              ? `${maskedEmail} adresine gönderdiğimiz bağlantıya tıklayarak hesabını etkinleştir.`
              : "Gönderdiğimiz doğrulama bağlantısına tıklayarak hesabını etkinleştir."}
          </p>
        </div>
        <div className="auth-checklist" aria-label="Doğrulama yardımı">
          <span aria-hidden>1</span><p>Gelen kutunu ve spam klasörünü kontrol et.</p>
          <span aria-hidden>2</span><p>Bağlantı yalnızca hesabını güvenle etkinleştirmek için kullanılır.</p>
        </div>
        {visibleMessage ? (
          <p className={messageClass} role="status">{visibleMessage}</p>
        ) : null}
        <form action={formAction}>
          <button
            className="button button-secondary"
            type="submit"
            disabled={pending || seconds > 0 || !maskedEmail}
          >
            {pending
              ? "Gönderiliyor…"
              : seconds > 0
                ? `Tekrar gönder (${seconds} sn)`
                : "Doğrulama e-postasını tekrar gönder"}
          </button>
        </form>
        <div className="button-row verification-actions">
          <form action={checkFormAction} noValidate>
            <button
              className="button button-primary"
              type="submit"
              disabled={checkPending}
            >
              {checkPending ? "Durum kontrol ediliyor…" : "Doğrulama durumunu kontrol et"}
            </button>
          </form>
          <Link className="button button-secondary" href="/">Ana menüye dön</Link>
        </div>
        <p className="fine-print">
          Adres yanlış mı? <Link href="/signup">Farklı e-postayla kayıt ol</Link>
        </p>
      </section>
    </main>
  );
}
