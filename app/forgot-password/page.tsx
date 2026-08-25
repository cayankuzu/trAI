import type { Metadata } from "next";
import { PasswordScreen } from "@/components/screens/password-screen";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return <PasswordScreen mode="request" />;
}
