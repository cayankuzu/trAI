import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { TryOnDraftProvider } from "@/components/try-on-draft-provider";
import { appConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

async function requireWorkspaceIdentity() {
  const supabase = await createClient();

  if (supabase) {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (error || typeof userId !== "string" || !userId) redirect("/login");

    return {
      userId,
      accountLabel: typeof data.claims.email === "string" ? data.claims.email : "Hesabım",
    };
  }

  if (appConfig.isDemoMode) {
    const cookieStore = await cookies();
    if (!cookieStore.get("trai-demo-session")) redirect("/login");
    return { userId: "local-demo", accountLabel: "Demo modu" };
  }

  redirect("/login");
}

export default async function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  const identity = await requireWorkspaceIdentity();

  return (
    <AppShell accountLabel={identity.accountLabel}>
      <TryOnDraftProvider key={identity.userId} userId={identity.userId}>
        {children}
      </TryOnDraftProvider>
    </AppShell>
  );
}
