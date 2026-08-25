"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/auth/actions";
import { PasswordField } from "@/components/password-field";
import { SectionHeading } from "@/components/section-heading";
import { initialAuthState } from "@/lib/auth-state";

export function ChangePasswordScreen() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    initialAuthState,
  );

  return (
    <section className="content-page narrow-page">
      <SectionHeading
        eyebrow="HESAP GÜVENLİĞİ"
        title="Şifreni değiştir"
        description="Hesabını korumak için mevcut şifreni doğrula ve yeni bir şifre belirle."
      />
      <form className="security-card form-stack" action={formAction} noValidate>
        <PasswordField
          name="currentPassword"
          label="Mevcut şifre"
          autoComplete="current-password"
          error={state.fieldErrors?.currentPassword}
        />
        <div className="security-divider" />
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
        {state.message ? (
          <p className={`form-message is-${state.status}`} role="alert">{state.message}</p>
        ) : null}
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Şifre değiştiriliyor…" : "Şifreyi değiştir"}
        </button>
        <p className="form-help">Şifren değiştiğinde güvenliğin için işlemi açık oturumunda tamamlarız.</p>
      </form>
    </section>
  );
}

