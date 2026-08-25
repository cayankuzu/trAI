import type { Metadata } from "next";
import { AuthScreen } from "@/components/screens/auth-screen";

export const metadata: Metadata = { title: "Hesap oluştur" };

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
