type SupabaseAuthError = {
  code?: string;
  message: string;
};

function normalizedError(error: SupabaseAuthError) {
  return {
    code: error.code?.toLocaleLowerCase("en-US") ?? "",
    message: error.message.toLocaleLowerCase("en-US"),
  };
}

export function authErrorMessage(error: SupabaseAuthError) {
  const { message } = normalizedError(error);

  if (message.includes("invalid login credentials")) {
    return "Kayıtlı e-posta adresi veya şifre hatalı.";
  }

  if (message.includes("email not confirmed")) {
    return "Giriş yapmadan önce e-posta adresini doğrulamalısın.";
  }

  if (message.includes("same password") || message.includes("password should be different")) {
    return "Yeni şifren mevcut şifrenden farklı olmalı.";
  }

  if (message.includes("rate limit") || message.includes("security purposes")) {
    return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.";
  }

  return "İşlem tamamlanamadı. Bilgilerini kontrol edip tekrar dene.";
}

function emailDeliveryErrorMessage(
  error: SupabaseAuthError,
  kind: "verification" | "password-reset",
) {
  const { code, message } = normalizedError(error);
  const requestName = kind === "verification" ? "doğrulama" : "yenileme";

  if (
    code.includes("rate_limit") ||
    code === "over_email_send_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("security purposes")
  ) {
    return `Çok fazla ${requestName} e-postası istendi. Birkaç dakika sonra tekrar dene.`;
  }

  if (
    code === "email_address_not_authorized" ||
    message.includes("email address not authorized")
  ) {
    return "E-posta servisi bu adrese gönderim için henüz yapılandırılmamış. Destek ekibiyle iletişime geç.";
  }

  return kind === "verification"
    ? "Doğrulama e-postası gönderilemedi. Biraz sonra tekrar dene."
    : "Şifre yenileme e-postası gönderilemedi. Biraz sonra tekrar dene.";
}

export function passwordResetErrorMessage(error: SupabaseAuthError) {
  return emailDeliveryErrorMessage(error, "password-reset");
}

export function verificationEmailErrorMessage(error: SupabaseAuthError) {
  return emailDeliveryErrorMessage(error, "verification");
}
