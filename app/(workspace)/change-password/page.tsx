import type { Metadata } from "next";
import { ChangePasswordScreen } from "@/components/screens/change-password-screen";

export const metadata: Metadata = { title: "Şifreni değiştir" };

export default function ChangePasswordPage() {
  return <ChangePasswordScreen />;
}
