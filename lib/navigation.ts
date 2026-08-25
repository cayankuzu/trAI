import type { NavigationItem } from "@/lib/types";

export const navigationItems: NavigationItem[] = [
  {
    key: "try-on",
    label: "Yeni prova",
    href: "/try-on",
    icon: "/icons/try-on.svg",
  },
  {
    key: "looks",
    label: "Kombinler",
    href: "/looks",
    icon: "/icons/looks.svg",
  },
  {
    key: "profile",
    label: "Profil",
    href: "/profile",
    icon: "/icons/profile.svg",
  },
];
