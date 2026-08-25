import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getAuthConfirmFailureDestination,
  getSafeAuthConfirmDestination,
} from "@/lib/auth-redirect";
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE,
} from "@/lib/auth-cookies";
import { createRecoveryProof } from "@/lib/recovery-proof";
import { getSupabaseConfig } from "@/lib/config";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && EMAIL_OTP_TYPES.has(value as EmailOtpType));
}

function createAuthCallbackClient(request: NextRequest, response: NextResponse) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

function withRecoveryCookie(
  response: NextResponse,
  isRecovery: boolean,
  userId: string | undefined,
) {
  if (isRecovery && userId) {
    const proof = createRecoveryProof(userId);
    if (!proof) return null;

    response.cookies.set(PASSWORD_RECOVERY_COOKIE, proof, {
      httpOnly: true,
      maxAge: PASSWORD_RECOVERY_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const requestedNext = request.nextUrl.searchParams.get("next") ??
    (otpType === "recovery" ? "/reset-password" : null);
  const next = getSafeAuthConfirmDestination(
    requestedNext,
  );
  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createAuthCallbackClient(request, response);

  if (!supabase) {
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (tokenHash && isEmailOtpType(otpType)) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (!error) {
      const nextResponse = withRecoveryCookie(
        response,
        next === "/reset-password",
        data.user?.id,
      );
      if (nextResponse) return nextResponse;
    }
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const nextResponse = withRecoveryCookie(
        response,
        next === "/reset-password",
        data.user?.id,
      );
      if (nextResponse) return nextResponse;
    }
  }

  return NextResponse.redirect(
    new URL(getAuthConfirmFailureDestination(requestedNext), request.url),
  );
}
