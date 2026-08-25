import type { LookItem } from "@/lib/types";

export const savedLooks: LookItem[] = [
  {
    id: "demo-look-1",
    title: "Kırmızı ceket provası",
    meta: "Bugün oluşturuldu",
    label: "AI görsel prova",
    image: "/images/trai-fashion-hero.png",
    productUrl: "https://example.com/kirmizi-ceket",
  },
  {
    id: "demo-look-2",
    title: "Hafta sonu kombini",
    meta: "Dün kaydedildi",
    label: "AI görsel prova",
    image: "/images/trai-fashion-hero.png",
    productUrl: "https://example.com/hafta-sonu-kombini",
  },
];

export const profileSummary = [
  { label: "Boy", value: "168 cm" },
  { label: "Göğüs", value: "88 cm" },
  { label: "Bel", value: "68 cm" },
  { label: "Kalça", value: "94 cm" },
];
