"use client";

import { useId, useState } from "react";
import { getPasswordStrength } from "@/lib/password-strength";

type PasswordFieldProps = {
  name: "password" | "passwordConfirmation" | "currentPassword";
  label: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  error?: string;
  showStrength?: boolean;
};

export function PasswordField({
  name,
  label,
  autoComplete,
  placeholder,
  error,
  showStrength = false,
}: PasswordFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const strengthId = `${inputId}-strength`;
  const [isVisible, setIsVisible] = useState(false);
  const [value, setValue] = useState("");
  const strength = getPasswordStrength(value);
  const describedBy = [showStrength && value ? strengthId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input-wrap">
        <input
          id={inputId}
          name={name}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={name === "currentPassword" ? 1 : 8}
          maxLength={72}
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          required
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setIsVisible((current) => !current)}
          aria-controls={inputId}
          aria-label={`${label} alanındaki şifreyi ${isVisible ? "gizle" : "göster"}`}
        >
          {isVisible ? "Gizle" : "Göster"}
        </button>
      </div>
      {showStrength && value ? (
        <div className="password-strength" id={strengthId} aria-live="polite">
          <div className="strength-heading">
            <span>Şifre gücü</span>
            <strong>{strength.label}</strong>
          </div>
          <div className={`strength-meter strength-${strength.score}`} aria-hidden>
            <span /><span /><span /><span />
          </div>
          <ul className="password-requirements" aria-label="Şifre koşulları">
            <li className={strength.requirements.length ? "is-met" : undefined}>En az 8 karakter</li>
            <li className={strength.requirements.letter ? "is-met" : undefined}>En az 1 harf</li>
            <li className={strength.requirements.number ? "is-met" : undefined}>En az 1 rakam</li>
          </ul>
        </div>
      ) : null}
      {error ? <span className="field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}

