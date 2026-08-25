"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement } from "react";
import { navigationItems } from "@/lib/navigation";
import type { NavigationKey } from "@/lib/types";

type BottomNavigationProps = {
  active?: NavigationKey;
  className?: string;
  ariaLabel?: string;
};

const FALLBACK_ICONS: Record<NavigationKey, ReactElement> = {
  "try-on": (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4h6M12 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM6 4h4M8 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Zm3 0v11M15 8v11M8 13h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  looks: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8M8 12h5M8 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

const PROFILE_PATHS = ["/profile", "/settings", "/support", "/change-password"];

function activeKeyForPath(pathname: string): NavigationKey | undefined {
  if (pathname === "/try-on" || pathname.startsWith("/try-on/")) return "try-on";
  if (pathname === "/looks" || pathname.startsWith("/looks/")) return "looks";
  if (PROFILE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "profile";
  return undefined;
}

export function BottomNavigation({
  active,
  className = "",
  ariaLabel = "Ana navigasyon",
}: BottomNavigationProps) {
  const pathname = usePathname();
  const activeKey = active ?? activeKeyForPath(pathname);
  const [iconLoadFailed, setIconLoadFailed] = useState<Record<string, boolean>>({});

  return (
    <nav className={`main-navigation ${className}`.trim()} aria-label={ariaLabel}>
      {navigationItems.map((item) => {
        const isActive = item.key === activeKey;
        const shouldShowFallback = Boolean(iconLoadFailed[item.key]);

        return (
          <Link
            className={`navigation-item ${isActive ? "is-active" : ""}`}
            href={item.href}
            key={item.key}
            aria-current={isActive ? "page" : undefined}
          >
            {shouldShowFallback ? (
              <span aria-hidden className="navigation-fallback-icon">
                {FALLBACK_ICONS[item.key]}
              </span>
            ) : (
              <img
                src={item.icon}
                alt=""
                width={24}
                height={24}
                onError={() => setIconLoadFailed((previous) => ({ ...previous, [item.key]: true }))}
              />
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
