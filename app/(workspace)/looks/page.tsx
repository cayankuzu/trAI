import type { Metadata } from "next";
import { LooksScreen } from "@/components/screens/looks-screen";

export const metadata: Metadata = { title: "Kombinler" };

export default function LooksPage() {
  return <LooksScreen />;
}
