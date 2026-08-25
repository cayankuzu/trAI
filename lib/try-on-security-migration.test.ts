import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608200003_fal_try_on_pipeline.sql", import.meta.url),
  "utf8",
);
const initialMigration = readFileSync(
  new URL("../supabase/migrations/202608200001_initial_schema.sql", import.meta.url),
  "utf8",
);
const hardenedInputMigration = readFileSync(
  new URL("../supabase/migrations/202608240007_harden_try_on_inputs_and_look_insert.sql", import.meta.url),
  "utf8",
);
const cleanupMigration = readFileSync(
  new URL("../supabase/migrations/202608240008_reconcile_provider_and_stale_uploads.sql", import.meta.url),
  "utf8",
);
const cleanupHotfixMigration = readFileSync(
  new URL("../supabase/migrations/202608240009_fix_stale_cleanup_request_id_ambiguity.sql", import.meta.url),
  "utf8",
);
const tryOnRoute = readFileSync(
  new URL("../app/api/try-ons/route.ts", import.meta.url),
  "utf8",
);
const uploadIntentRoute = readFileSync(
  new URL("../app/api/try-ons/upload-intent/route.ts", import.meta.url),
  "utf8",
);
const tryOnScreen = readFileSync(
  new URL("../components/screens/try-on-screen.tsx", import.meta.url),
  "utf8",
);
const adminClient = readFileSync(
  new URL("../lib/supabase/admin.ts", import.meta.url),
  "utf8",
);

function functionDefinition(source: string, functionName: string) {
  const start = source.indexOf(`create or replace function public.${functionName}`);
  const end = source.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

describe("fal.ai güvenlik migrasyonu", () => {
  it("değiştirilemez ledger, sabit kota ve transaction kilidi içerir", () => {
    expect(migration).toContain("create table if not exists public.try_on_usage");
    expect(migration).toContain("fixed_monthly_limit constant integer := 5");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("return query select 'quota_exceeded'");
  });

  it("browser Storage insert/update politikalarını kaldırır, own select/delete politikalarını korur", () => {
    expect(migration).toContain('drop policy if exists "user_photos_insert_own"');
    expect(migration).toContain('drop policy if exists "user_photos_update_own"');
    expect(migration).toContain('drop policy if exists "user_photos_insert_claimed"');
    expect(migration).not.toMatch(/create policy\s+"[^"]*(insert|update)[^"]*"\s+on storage\.objects/i);
    expect(initialMigration).toContain('create policy "user_photos_select_own"');
    expect(initialMigration).toContain('create policy "user_photos_delete_own"');
    expect(hardenedInputMigration).toContain('drop policy if exists "user_photos_delete_own"');
  });

  it("tüm kota/durum RPC'lerini yalnız service_role ve sunucudan doğrulanmış p_user_id ile açar", () => {
    expect(initialMigration).not.toContain('create policy "try_ons_update_own"');
    expect(migration).toContain('drop policy if exists "try_ons_update_own"');
    expect(migration).toContain('drop policy if exists "try_ons_delete_own"');
    expect(migration).toContain("revoke insert, update, delete on table public.try_ons from anon, authenticated");

    for (const functionName of [
      "claim_try_on_upload",
      "begin_try_on_generation",
      "record_try_on_provider_request",
      "prepare_try_on_garment",
      "prepare_try_on_result",
      "complete_try_on_generation",
      "fail_try_on_generation",
      "record_try_on_retryable_error",
    ]) {
      expect(migration).toContain(`create or replace function public.${functionName}`);
      expect(migration).toMatch(new RegExp(
        `revoke all on function public\\.${functionName}\\([^;]+\\) from public, anon, authenticated;`,
      ));
      expect(migration).toMatch(new RegExp(
        `grant execute on function public\\.${functionName}\\([^;]+\\) to service_role;`,
      ));
    }

    expect(migration.match(/p_user_id uuid/g)).toHaveLength(8);
    expect(migration.match(/auth\.role\(\)/g)).toHaveLength(8);
    expect(migration).not.toMatch(/grant execute[^;]+to authenticated;/i);
    expect(migration).not.toContain("auth.uid()");
    for (const oldSignature of [
      "claim_try_on_upload(uuid, text, text, text)",
      "begin_try_on_generation(uuid)",
      "record_try_on_provider_request(uuid, text)",
      "prepare_try_on_garment(uuid, text)",
      "prepare_try_on_result(uuid, text)",
      "complete_try_on_generation(uuid, text, text)",
      "fail_try_on_generation(uuid, text)",
      "record_try_on_retryable_error(uuid, text, boolean)",
    ]) {
      expect(migration).toContain(`drop function if exists public.${oldSignature};`);
    }
    expect(tryOnRoute).not.toMatch(/\.from\("try_ons"\)\s*\.update\(/);
  });

  it("opaque Supabase secret key için oturumsuz server-only admin client oluşturur", () => {
    expect(adminClient).toContain('import "server-only"');
    expect(adminClient).toContain("process.env.SUPABASE_SECRET_KEY");
    expect(adminClient).not.toContain("NEXT_PUBLIC_SUPABASE_SECRET_KEY");
    expect(adminClient).toContain("persistSession: false");
    expect(adminClient).toContain("autoRefreshToken: false");
    expect(adminClient).toContain("detectSessionInUrl: false");
  });

  it("route'lar browser oturumunu yalnız claims için, admin client'ı durum ve Storage için kullanır", () => {
    for (const route of [tryOnRoute, uploadIntentRoute]) {
      expect(route).toContain("const authClient = await createClient()");
      expect(route).toContain("authClient.auth.getClaims()");
      expect(route).toContain("const adminClient = createAdminClient()");
      expect(route).toContain("p_user_id: userId");
    }

    expect(uploadIntentRoute).toContain('adminClient.rpc("claim_try_on_batch"');
    expect(uploadIntentRoute).toContain("adminClient.storage");
    expect(uploadIntentRoute).toContain("createSignedUploadUrl");
    expect(tryOnRoute).toContain('.eq("id", id)');
    expect(tryOnRoute).toContain('.eq("user_id", userId)');
    expect(tryOnRoute).not.toMatch(/\bsupabase\.(rpc|storage|from)/);
  });

  it("private upload'ın magic-byte türü DB path uzantısıyla eşleşmek zorundadır", () => {
    expect(tryOnRoute).toContain("!matchesStorageImageExtension(path, detected.extension)");
    expect(tryOnRoute).toContain('"stored_photo_invalid"');
  });

  it("server-owned deterministik çıktı yollarını retry sırasında güvenle yeniler", () => {
    expect(tryOnRoute).toContain("upsert: true");
    expect(cleanupMigration).toContain("provider_started_at is null and p_error_code <> 'provider_submit_uncertain'");
    expect(cleanupMigration).toContain("array['provider_start_timeout','provider_cancelled']");
    expect(cleanupMigration).toContain("delete from public.try_on_usage");
  });

  it("aynı requestId tekrarında dosya manifestini de birebir doğrular", () => {
    expect(migration).toContain("next_person_path <> (p_user_id::text");
    expect(migration).toMatch(/next_garment_path is distinct from\s*\(\s*case/);
  });

  it("prova demo yolu kimlik doğrulama, upload ve kota denetimini atlayamaz", () => {
    expect(tryOnRoute).not.toContain("input.demo");
    expect(tryOnRoute).not.toContain('mode: "demo"');
    expect(tryOnRoute).not.toContain("demo: z.boolean");
    expect(tryOnScreen).not.toContain("Demo veriyi kullan");
    expect(tryOnScreen).not.toContain("demoMode");
    expect(tryOnScreen).not.toMatch(/\bdemo:\s*/);
  });

  it("eksik PostgREST RPC imzasını migration hatası olarak sınıflandırır", () => {
    expect(uploadIntentRoute).toContain('code === "pgrst202"');
    expect(uploadIntentRoute).toContain('combined.includes("claim_try_on_batch")');
  });

  it("keeps browser upload tokens append-only and aligns the bucket limit", () => {
    expect(uploadIntentRoute).toContain('createSignedUploadUrl(claim.person_path, { upsert: false })');
    expect(hardenedInputMigration).toContain("set file_size_limit = 6291456");
  });

  it("requires completed, owned sources and covers for direct look mutations", () => {
    expect(hardenedInputMigration).toContain('create policy "looks_insert_own"');
    expect(hardenedInputMigration).toContain('create policy "looks_update_own"');
    expect(hardenedInputMigration).toContain("source_try_on.status = 'completed'");
    expect(hardenedInputMigration).toContain("completed_variant.status = 'completed'");
    expect(hardenedInputMigration).toContain("cover_try_on.status = 'completed'");
  });

  it("keeps uncertain provider submits in quota and caps stale daily claims", () => {
    expect(hardenedInputMigration).toContain("request.error_code = 'provider_submit_uncertain'");
    expect(cleanupMigration).toContain("when p_error_code = 'provider_submit_uncertain'");
    expect(cleanupMigration).toContain("then coalesce(provider_started_at, pg_catalog.now())");
    expect(hardenedInputMigration).toContain("fixed_daily_reservation_limit constant integer := 20");
    expect(hardenedInputMigration).toContain("daily reservation limit reached");
  });

  it("keeps input paths until Storage deletion succeeds, then finalizes only deterministic paths", () => {
    const completeFunction = functionDefinition(cleanupMigration, "complete_try_on_generation");
    const failFunction = functionDefinition(cleanupMigration, "fail_try_on_generation");
    const finalizeFunction = functionDefinition(cleanupMigration, "finalize_try_on_input_cleanup");

    expect(completeFunction).not.toContain("source_path = null");
    expect(completeFunction).not.toContain("garment_path = null");
    expect(failFunction).not.toContain("source_path = null");
    expect(failFunction).not.toContain("garment_path = null");
    expect(failFunction).not.toContain("result_path = null");
    expect(failFunction).toContain("and (source_path is null or source_path = any(array[");
    expect(failFunction).toContain("and (garment_path is null or garment_path = any(array[");
    expect(failFunction).toContain("and (result_path is null or result_path = any(array[");

    expect(finalizeFunction).toContain("set source_path = null");
    expect(finalizeFunction).toContain("garment_path = null");
    expect(finalizeFunction).toContain("case when status = 'completed' then result_path else null end");
    expect(finalizeFunction).toContain("status = any(array['completed','failed']::public.try_on_status[])");
  });

  it("exposes cleanup RPCs only to service_role", () => {
    for (const functionName of [
      "complete_try_on_generation",
      "fail_try_on_generation",
      "finalize_try_on_input_cleanup",
      "claim_stale_try_on_cleanup",
    ]) {
      const definition = functionDefinition(cleanupMigration, functionName);
      expect(definition).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(cleanupMigration).toMatch(new RegExp(
        `revoke all on function public\\.${functionName}\\([^;]+\\) from public, anon, authenticated;`,
      ));
      expect(cleanupMigration).toMatch(new RegExp(
        `grant execute on function public\\.${functionName}\\([^;]+\\) to service_role;`,
      ));
    }
    expect(cleanupMigration).not.toMatch(/grant execute[^;]+to authenticated;/i);
  });

  it("reclaims only abandoned provider-free uploads and returns a bounded owned manifest", () => {
    const claimFunction = functionDefinition(cleanupMigration, "claim_stale_try_on_cleanup");

    expect(claimFunction).toContain("p_limit not between 1 and 25");
    expect(claimFunction).toContain("request.user_id = p_user_id");
    expect(claimFunction).toContain("request.created_at < pg_catalog.now() - interval '30 minutes'");
    expect(claimFunction).toContain("request.provider_request_id is null");
    expect(claimFunction).toContain("usage.provider_started_at is null");
    expect(claimFunction).toContain("for update of request skip locked");
    expect(claimFunction).toContain("set status = 'failed', error_code = 'upload_expired'");
    expect(claimFunction).toContain("provider_started_at is null");
    expect(claimFunction).toContain("p_user_id::text || '/' || request.id::text || '/person.jpg'");
    expect(claimFunction).toContain("case when stale_row.status = 'completed' then null::text else stale_row.result_path end");
  });

  it("qualifies the ledger request id in both fresh installs and the deployed hotfix", () => {
    const expectedDelete = "delete from public.try_on_usage as stale_usage";
    const expectedRequestId = "stale_usage.request_id = stale_row.id";

    expect(functionDefinition(cleanupMigration, "claim_stale_try_on_cleanup")).toContain(expectedDelete);
    expect(functionDefinition(cleanupMigration, "claim_stale_try_on_cleanup")).toContain(expectedRequestId);
    expect(functionDefinition(cleanupHotfixMigration, "claim_stale_try_on_cleanup")).toContain(expectedDelete);
    expect(functionDefinition(cleanupHotfixMigration, "claim_stale_try_on_cleanup")).toContain(expectedRequestId);
  });

  it("refunds confirmed provider cancellation but retains uncertain-submit quota", () => {
    const failFunction = functionDefinition(cleanupMigration, "fail_try_on_generation");

    expect(failFunction).toContain("p_error_code = any(array['provider_start_timeout','provider_cancelled']::text[])");
    expect(failFunction).toContain("p_error_code <> 'provider_submit_uncertain'");
    expect(failFunction).toContain("when p_error_code = 'provider_submit_uncertain'");
    expect(failFunction).toContain("then coalesce(provider_started_at, pg_catalog.now())");
  });
});
