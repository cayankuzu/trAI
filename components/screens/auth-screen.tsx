"use client";

import Link from "next/link";
import { useActionState } from "react";
import { authenticate } from "@/app/auth/actions";
import { PasswordField } from "@/components/password-field";
import { initialAuthState, type AuthMode } from "@/lib/auth-state";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const isLogin = mode === "login";
  const action = authenticate.bind(null, mode);
  const [state, formAction, pending] = useActionState(action, initialAuthState);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand" href="/">trAI</Link>
        <div>
          <p className="eyebrow">{isLogin ? "TEKRAR HOŞ GELDİN" : "ÜCRETSİZ HESAP"}</p>
          <h1 id="auth-title">{isLogin ? "Hesabına giriş yap" : "Hesabını oluştur"}</h1>
          <p className="lead">
            {isLogin
              ? "Kaydettiğin prova sonuçlarına ve kombinlerine devam et."
              : "İlk sanal provanı oluşturmak için birkaç bilgi yeterli."}
          </p>
        </div>
        <form className="form-stack" action={formAction} noValidate>
          {!isLogin ? (
            <>
              <label>
                Ad soyad
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Jhon Doe"
                  maxLength={80}
                  aria-invalid={Boolean(state.fieldErrors?.name)}
                  aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
                  required
                />
                {state.fieldErrors?.name ? <span className="field-error" id="name-error" role="alert">{state.fieldErrors.name}</span> : null}
              </label>
              <fieldset className="choice-fieldset" aria-describedby={state.fieldErrors?.gender ? "gender-error" : undefined}>
                <legend>Cinsiyet</legend>
                <div className="choice-options">
                  <label className="choice-option"><input type="radio" name="gender" value="female" required /><span>Kadın</span></label>
                  <label className="choice-option"><input type="radio" name="gender" value="male" /><span>Erkek</span></label>
                  <label className="choice-option"><input type="radio" name="gender" value="other" /><span>Diğer</span></label>
                </div>
                {state.fieldErrors?.gender ? <span className="field-error" id="gender-error" role="alert">{state.fieldErrors.gender}</span> : null}
              </fieldset>
            </>
          ) : null}
          <label>
            E-posta
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ornek@mail.com"
              aria-invalid={Boolean(state.fieldErrors?.email)}
              aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
              required
            />
            {state.fieldErrors?.email ? <span className="field-error" id="email-error" role="alert">{state.fieldErrors.email}</span> : null}
          </label>
          <PasswordField
            name="password"
            label="Şifre"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? undefined : "En az 8 karakter ve bir rakam"}
            error={state.fieldErrors?.password}
            showStrength={!isLogin}
          />
          {isLogin ? <Link className="form-inline-link" href="/forgot-password">Şifremi unuttum</Link> : null}
          {state.message ? (
            <p className={`form-message is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
              {state.message}
            </p>
          ) : null}
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? "Hazırlanıyor…" : isLogin ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>
        <p className="auth-switch">
          {isLogin ? "Hesabın yok mu?" : "Zaten hesabın var mı?"}{" "}
          <Link href={isLogin ? "/signup" : "/login"}>
            {isLogin ? "Hesap oluştur" : "Giriş yap"}
          </Link>
        </p>
        <p className="fine-print">
          Devam ederek <Link href="/legal/terms">Kullanım Koşulları</Link> ve{" "}
          <Link href="/legal/privacy">Gizlilik Politikası</Link>&apos;nı kabul edersin.
        </p>
      </section>
    </main>
  );
}
