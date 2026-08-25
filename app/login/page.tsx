import type { Metadata } from "next";
import { AuthScreen } from "@/components/screens/auth-screen";

export const metadata: Metadata = { title: "Giriş yap" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
