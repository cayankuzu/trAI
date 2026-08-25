import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608240010_weight_and_unlimited_test_mode.sql", import.meta.url),
  "utf8",
);
const profileRoute = readFileSync(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");
const uploadRoute = readFileSync(new URL("../app/api/try-ons/upload-intent/route.ts", import.meta.url), "utf8");
const generationRoute = readFileSync(new URL("../app/api/try-ons/route.ts", import.meta.url), "utf8");
const tryOnPage = readFileSync(new URL("../app/(workspace)/try-on/page.tsx", import.meta.url), "utf8");
const tryOnScreen = readFileSync(new URL("../components/screens/try-on-screen.tsx", import.meta.url), "utf8");
const modeHelper = readFileSync(new URL("./try-on-test-mode.ts", import.meta.url), "utf8");

describe("kilo ölçüsü ve yerel sınırsız prova modu", () => {
  it("kiloyu nullable smallint olarak doğrular ve authenticated profil RPC'sinde saklar", () => {
    expect(migration).toContain("add column if not exists weight_kg smallint");
    expect(migration).toContain("weight_kg is null or weight_kg between 20 and 350");
    expect(migration).toContain("p_weight_kg smallint");
    expect(migration).toContain("weight_kg = p_weight_kg");
    expect(migration).toMatch(/revoke all on function public\.update_own_profile\([^)]+\) from public, anon;/);
    expect(migration).toMatch(/grant execute on function public\.update_own_profile\([^)]+\) to authenticated;/);
    expect(profileRoute).toContain("weightKg: optionalMeasurement(20, 350)");
    expect(profileRoute).toContain("p_weight_kg: parsed.data.weightKg");
  });

  it("test muafiyetini kalıcı server-owned satırda tutar ve normal sayaçtan çıkarır", () => {
    expect(migration).toContain("add column if not exists quota_exempt boolean not null default false");
    expect(migration).toContain("and not request.quota_exempt");
    expect(migration).toContain("if not p_quota_exempt and current_count + variant_count > fixed_monthly_limit");
    expect(migration).toContain("stored_row.quota_exempt <> p_quota_exempt");
    expect(migration).toContain("'processing', p_quota_exempt");
    expect(migration).toContain("if not reservation_is_active and not request_is_quota_exempt then");
    expect(migration).toContain("if new.quota_exempt then return new; end if;");
  });

  it("muaf batch RPC'sini browser rollerine açmaz ve normal imzayı kotaya tabi wrapper olarak korur", () => {
    expect(migration).toMatch(/revoke all on function public\.claim_try_on_batch\([^;]+boolean\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.claim_try_on_batch\([^;]+boolean\) to service_role;/);
    expect(migration).toContain("technical_variant_limit constant integer := 18");
    expect(migration).toMatch(/select \* from public\.claim_try_on_batch\([\s\S]+false\s*\);/);
  });

  it("bypass kararını istemciden değil yalnız yerel development sunucusundan alır", () => {
    expect(modeHelper).toContain('import "server-only"');
    expect(modeHelper).toContain('process.env.NODE_ENV !== "development"');
    expect(modeHelper).toContain("process.env.VERCEL_ENV");
    expect(modeHelper).toContain("process.env.TRY_ON_UNLIMITED_TEST_MODE");
    expect(tryOnPage).toContain("unlimitedTestMode={isTryOnUnlimitedTestMode()}");
    expect(uploadRoute).toContain("p_quota_exempt: unlimitedTestMode");
    expect(uploadRoute).not.toMatch(/z\.(?:boolean|literal)\([^)]*\).*?(?:testMode|skipLimits|quotaExempt)/i);
    expect(generationRoute).toContain("if (!unlimitedTestMode)");
  });

  it("test modunda arayüz batch uyarısını ve generate engelini uygulamaz", () => {
    expect(tryOnScreen).toContain("!unlimitedTestMode && resultCount > MAX_RESULTS_PER_BATCH");
    expect(tryOnScreen).toContain("(!unlimitedTestMode && resultCount > MAX_RESULTS_PER_BATCH)");
    expect(tryOnScreen).toContain("test kotası kapalı");
  });

  it("eski Storage temizliği upload-intent yanıtını bloke etmez", () => {
    expect(uploadRoute).toContain('import { after, NextResponse, type NextRequest } from "next/server"');
    expect(uploadRoute).toContain("after(async () => {");
    expect(uploadRoute).not.toMatch(/\n\s*await cleanupStaleUploads\(adminClient, userId\);\n\s*if \(!process\.env\.FAL_KEY/);
  });
});
