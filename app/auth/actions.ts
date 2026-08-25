"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_EMAIL_COOKIE,
  AUTH_EMAIL_COOKIE_MAX_AGE,
  AUTH_EMAIL_SENT_AT_COOKIE,
  PASSWORD_RECOVERY_COOKIE,
  VERIFICATION_RESEND_SECONDS,
} from "@/lib/auth-cookies";
import {
  authErrorMessage,
  passwordResetErrorMessage,
  verificationEmailErrorMessage,
} from "@/lib/auth-errors";
import { appConfig } from "@/lib/config";
import { hasValidRecoveryProof } from "@/lib/recovery-proof";
import type { AuthActionState, AuthField, AuthMode } from "@/lib/auth-state";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  loginSchema,
  passwordChangeSchema,
  passwordUpdateSchema,
  signupSchema,
} from "@/lib/validation";

async function rememberAuthEmail(email: string, markAsSent = false) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_EMAIL_COOKIE, email, {
    httpOnly: true,
    maxAge: AUTH_EMAIL_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (markAsSent) {
    cookieStore.set(AUTH_EMAIL_SENT_AT_COOKIE, Date.now().toString(), {
      httpOnly: true,
      maxAge: AUTH_EMAIL_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
}

function getValidationState(error: {
  issues: { message: string; path: PropertyKey[] }[];
}): AuthActionState {
  const fieldErrors: Partial<Record<AuthField, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as AuthField] = issue.message;
    }
  }

  return {
    status: "error",
    message: error.issues[0]?.message ?? "Bilgilerini kontrol et.",
    fieldErrors,
  };
}

export async function authenticate(
  mode: AuthMode,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const values = {
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    gender: formData.get("gender"),
  };
  const supabase = await createClient();

  if (mode === "login") {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) return getValidationState(parsed.error);

    if (!supabase) {
      if (!appConfig.isDemoMode) {
        return { status: "error", message: "Güvenli oturum servisi yapılandırılmamış." };
      }

      const cookieStore = await cookies();
      cookieStore.set("trai-demo-session", crypto.randomUUID(), {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      redirect("/try-on");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return { status: "error", message: authErrorMessage(error) };
    }

    redirect("/try-on");
  }

  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return getValidationState(parsed.error);

  if (!supabase) {
    if (!appConfig.isDemoMode) {
      return { status: "error", message: "Güvenli oturum servisi yapılandırılmamış." };
    }

    await rememberAuthEmail(parsed.data.email, true);
    redirect("/verify-email");
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name, gender: parsed.data.gender },
      emailRedirectTo: `${appConfig.appUrl}/auth/confirm`,
    },
  });

  if (error) {
    return { status: "error", message: authErrorMessage(error) };
  }

  if (data.session) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "E-posta doğrulaması henüz etkin değil. Supabase Auth ayarından e-posta onayını etkinleştir.",
    };
  }

  await rememberAuthEmail(parsed.data.email, true);
  redirect("/verify-email");
}

export async function resendVerificationEmail(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  const cookieStore = await cookies();
  const parsed = emailSchema.safeParse(cookieStore.get(AUTH_EMAIL_COOKIE)?.value);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Doğrulama isteği bulunamadı. Hesap oluşturma adımını yeniden başlat.",
    };
  }

  const lastSentAt = Number(cookieStore.get(AUTH_EMAIL_SENT_AT_COOKIE)?.value ?? 0);
  const elapsedSeconds = Math.floor((Date.now() - lastSentAt) / 1_000);
  const retryAfter = VERIFICATION_RESEND_SECONDS - elapsedSeconds;

  if (lastSentAt > 0 && retryAfter > 0) {
    return {
      status: "success",
      message: "Doğrulama e-postası kısa süre önce gönderildi. Gelen kutunu kontrol et.",
      retryAfter,
    };
  }

  const supabase = await createClient();

  if (!supabase && !appConfig.isDemoMode) {
    return { status: "error", message: "Güvenli oturum servisi yapılandırılmamış." };
  }

  if (supabase) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: `${appConfig.appUrl}/auth/confirm` },
    });

    if (error) {
      return { status: "error", message: verificationEmailErrorMessage(error) };
    }
  }

  await rememberAuthEmail(parsed.data, true);
  return {
    status: "success",
    message: "Hesap uygunsa yeni doğrulama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.",
    retryAfter: VERIFICATION_RESEND_SECONDS,
  };
}

export async function requestPasswordReset(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "E-posta adresini kontrol et." };
  }

  const supabase = await createClient();

  if (!supabase && !appConfig.isDemoMode) {
    return {
      status: "error",
      message: "Güvenli oturum servisi yapılandırılmamış.",
    };
  }

  if (supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${appConfig.appUrl}/auth/confirm?next=/reset-password`,
    });

    if (error) {
      return { status: "error", message: passwordResetErrorMessage(error) };
    }
  }

  await rememberAuthEmail(parsed.data);
  redirect("/forgot-password/sent");
}

export async function updatePassword(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return getValidationState(parsed.error);
  }

  const supabase = await createClient();

  if (!supabase && !appConfig.isDemoMode) {
    return {
      status: "error",
      message: "Güvenli oturum servisi yapılandırılmamış.",
    };
  }

  if (supabase) {
    const cookieStore = await cookies();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      redirect("/reset-password/invalid");
    }

    if (!hasValidRecoveryProof(
      cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value,
      userData.user.id,
    )) {
      cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
      redirect("/reset-password/invalid");
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
      return { status: "error", message: authErrorMessage(error) };
    }

    await supabase.auth.signOut({ scope: "global" });
    cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  }

  redirect("/password-changed?source=recovery");
}

export async function changePassword(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return getValidationState(parsed.error);
  }

  const supabase = await createClient();

  if (!supabase && !appConfig.isDemoMode) {
    return { status: "error", message: "Güvenli oturum servisi yapılandırılmamış." };
  }

  if (supabase) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email;

    if (userError || !email) {
      redirect("/states/session-expired");
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.currentPassword,
    });

    if (verifyError) {
      return { status: "error", message: "Mevcut şifren doğru değil." };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (updateError) {
      return { status: "error", message: authErrorMessage(updateError) };
    }
  }

  redirect("/password-changed?source=settings");
}

export async function checkVerificationEmailStatus(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();

  if (!supabase && !appConfig.isDemoMode) {
    return { status: "error", message: "Güvenli oturum servisi yapılandırılmamış." };
  }

  if (!supabase) {
    return {
      status: "error",
      message: "Demo modunda doğrulama durumu kontrol edilemiyor. Ana menüye dönerek denemeye devam et.",
    };
  }

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      status: "error",
      message: "Henüz doğrulama oturumu tespit edilemedi. Lütfen doğrulama bağlantısına tıklayarak geri dön.",
    };
  }

  if (!user.email_confirmed_at) {
    return {
      status: "error",
      message: "E-posta doğrulaman tamamlanmadı. Mail kutunu ve spam klasörünü tekrar kontrol et.",
    };
  }

  redirect("/try-on");
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("trai-demo-session");
  redirect("/");
}

