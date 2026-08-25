import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { BottomNavigation } from "@/components/bottom-navigation";
import { createClient } from "@/lib/supabase/server";
import type { NavigationKey } from "@/lib/types";

type AppShellProps = {
  children: ReactNode;
  active?: NavigationKey;
  code?: string;
  accountLabel?: string;
};

export async function AppShell({ children, active, accountLabel: verifiedAccountLabel }: AppShellProps) {
  let accountLabel = verifiedAccountLabel;

  // Ana çalışma alanı kimliği ortak route layout'unda bir kez doğrular. AppShell,
  // layout dışındaki durum ekranları için geriye dönük güvenli doğrulamayı korur.
  if (!accountLabel) {
    const supabase = await createClient();
    accountLabel = "Demo modu";

    if (supabase) {
      const { data, error } = await supabase.auth.getClaims();
      if (error || !data?.claims?.sub) redirect("/login");
      accountLabel = typeof data.claims.email === "string" ? data.claims.email : "Hesabım";
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand-group">
            <Link className="brand" href="/" aria-label="trAI ana sayfa">
              trAI
            </Link>
          </div>
          <BottomNavigation active={active} className="desktop-navigation" />
          <div className="account-menu">
            <Link className="header-action" href="/settings" title={accountLabel}>Ayarlar</Link>
            <form action={signOut}><button className="header-signout" type="submit">Çıkış</button></form>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <BottomNavigation active={active} className="mobile-navigation" />
    </div>
  );
}
