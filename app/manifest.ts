import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "trAI Sanal Prova",
    short_name: "trAI",
    description: "AI destekli sanal prova web uygulaması",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#941f43",
    lang: "tr",
    icons: [
      { src: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
