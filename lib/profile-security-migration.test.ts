import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608200004_atomic_profile_update.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/profile/route.ts", import.meta.url),
  "utf8",
);

describe("atomik profil güncellemesi", () => {
  it("profil ve isteğe bağlı ölçüleri tek transaction RPC'sinde günceller", () => {
    expect(migration).toContain("create or replace function public.update_own_profile");
    expect(migration).toContain("update public.profiles");
    expect(migration).toContain("update public.measurements");
    expect(route).toContain('supabase.rpc("update_own_profile"');
    expect(route).not.toMatch(/Promise\.all\([\s\S]*\.update\(/);
  });

  it("fonksiyon çalıştırma yetkisini yalnız authenticated role verir", () => {
    expect(migration).toContain("auth.role()");
    expect(migration).toMatch(/revoke all on function[^;]+from public, anon;/);
    expect(migration).toMatch(/grant execute on function[^;]+to authenticated;/);
  });
});
