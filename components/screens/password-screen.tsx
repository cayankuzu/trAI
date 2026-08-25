"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  updatePassword,
} from "@/app/auth/actions";
import { PasswordField } from "@/components/password-field";
import { initialAuthState } from "@/lib/auth-state";

export function PasswordScreen({ mode }: { mode: "request" | "update" }) {
  const isRequest = mode === "request";
  const [state, formAction, pending] = useActionState(
    isRequest ? requestPasswordReset : updatePassword,
    initialAuthState,
  );

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="password-title">
        <Link className="brand" href="/">trAI</Link>
        <div>
          <p className="eyebrow">HESAP GÜVENLİĞİ</p>
          <h1 id="password-title">{isRequest ? "Şifreni yenile" : "Yeni şifre oluştur"}</h1>
          <p className="lead">
            {isRequest
              ? "Hesabındaki e-posta adresini gir; sana güvenli bir yenileme bağlantısı gönderelim."
              : "Hesabın için güçlü ve daha önce kullanmadığın bir şifre belirle."}
          </p>
        </div>
        <form className="form-stack" action={formAction} noValidate>
          {isRequest ? (
            <label>
              E-posta
              <input
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(state.fieldErrors?.email)}
                aria-describedby={state.fieldErrors?.email ? "reset-email-error" : undefined}
                required
              />
              {state.fieldErrors?.email ? <span className="field-error" id="reset-email-error" role="alert">{state.fieldErrors.email}</span> : null}
            </label>
          ) : (
            <>
              <PasswordField
                name="password"
                label="Yeni şifre"
                autoComplete="new-password"
                placeholder="En az 8 karakter ve bir rakam"
                error={state.fieldErrors?.password}
                showStrength
              />
              <PasswordField
                name="passwordConfirmation"
                label="Yeni şifreyi doğrula"
                autoComplete="new-password"
                error={state.fieldErrors?.passwordConfirmation}
              />
            </>
          )}
          {state.message ? (
            <p className={`form-message is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
              {state.message}
            </p>
          ) : null}
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending
              ? isRequest ? "Gönderiliyor…" : "Şifre güncelleniyor…"
              : isRequest ? "Güvenli bağlantı gönder" : "Şifreyi güncelle"}
          </button>
        </form>
        <Link className="auth-back-link" href="/login">← Girişe dön</Link>
      </section>
    </main>
  );
}
