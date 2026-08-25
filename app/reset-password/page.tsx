import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PasswordScreen } from "@/components/screens/password-screen";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth-cookies";
import { appConfig } from "@/lib/config";
import { hasValidRecoveryProof } from "@/lib/recovery-proof";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Yeni şifre" };

export default async function ResetPasswordPage() {
  if (appConfig.isSupabaseConfigured) {
    const cookieStore = await cookies();
    const supabase = await createClient();
    const { data, error } = await supabase!.auth.getUser();
    if (error || !data.user) redirect("/reset-password/invalid");

    if (!hasValidRecoveryProof(
      cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value,
      data.user.id,
    )) {
      redirect("/reset-password/invalid");
    }
  }

  return <PasswordScreen mode="update" />;
}
