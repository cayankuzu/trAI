import type { Metadata } from "next";
import { TryOnScreen } from "@/components/screens/try-on-screen";
import { isTryOnUnlimitedTestMode } from "@/lib/try-on-test-mode";

export const metadata: Metadata = { title: "Yeni prova" };

export default function TryOnPage() {
  return <TryOnScreen unlimitedTestMode={isTryOnUnlimitedTestMode()} />;
}
