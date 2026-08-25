import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NetworkStatus } from "@/components/network-status";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "trAI · AI destekli sanal prova",
    template: "%s · trAI",
  },
  description: "Katalogdan ürününü seç, fotoğrafınla sanal prova oluştur, karşılaştır ve kombinlerini kaydet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Ana içeriğe geç</a>
        <NetworkStatus />
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
