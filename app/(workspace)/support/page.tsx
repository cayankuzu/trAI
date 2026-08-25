import type { Metadata } from "next";
import { SupportScreen } from "@/components/screens/support-screen";

export const metadata: Metadata = { title: "Yardım ve destek" };

export default function SupportPage() {
  return <SupportScreen />;
}
