import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608200002_harden_account_deletion.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../app/api/account/route.ts", import.meta.url),
  "utf8",
);

describe("hesap silme güven sınırı", () => {
  it("doğrudan authenticated RPC'yi kaldırıp yalnız service_role fonksiyonunu açar", () => {
    expect(migration).toContain("drop function if exists public.delete_own_account()");
    expect(migration).toContain("create or replace function public.delete_user_account(p_user_id uuid)");
    expect(migration).toContain("service_role required");
    expect(migration).toContain(
      "revoke all on function public.delete_user_account(uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.delete_user_account(uuid) to service_role",
    );
  });

  it("mevcut şifreyi yeniden doğrular ve silmeyi admin sınırından yapar", () => {
    expect(route).toContain("supabase.auth.signInWithPassword");
    expect(route).toContain("const adminClient = createAdminClient()");
    expect(route).toContain('adminClient.rpc("delete_user_account"');
    expect(route).toContain('adminClient.storage.from("user-photos")');
  });
});
