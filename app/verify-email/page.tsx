import type { Metadata } from "next";
import { cookies } from "next/headers";
import { VerifyEmailScreen } from "@/components/screens/verify-email-screen";
import {
  AUTH_EMAIL_COOKIE,
  AUTH_EMAIL_SENT_AT_COOKIE,
  VERIFICATION_RESEND_SECONDS,
} from "@/lib/auth-cookies";
import { maskEmail } from "@/lib/auth-display";

export const metadata: Metadata = { title: "E-postanı doğrula" };

export default async function VerifyEmailPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get(AUTH_EMAIL_COOKIE)?.value;
  const lastSentAt = Number(cookieStore.get(AUTH_EMAIL_SENT_AT_COOKIE)?.value ?? 0);
  const elapsedSeconds = Math.floor((Date.now() - lastSentAt) / 1_000);
  const initialRetryAfter = lastSentAt > 0
    ? Math.max(0, VERIFICATION_RESEND_SECONDS - elapsedSeconds)
    : 0;

  return (
    <VerifyEmailScreen
      maskedEmail={maskEmail(email)}
      initialRetryAfter={initialRetryAfter}
    />
  );
}

