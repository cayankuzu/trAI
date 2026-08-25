import type { Metadata } from "next";
import { SettingsScreen } from "@/components/screens/settings-screen";

export const metadata: Metadata = { title: "Ayarlar" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
