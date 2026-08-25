import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608240005_size_aware_try_on_sessions.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL("../supabase/migrations/202608240006_harden_size_and_look_updates.sql", import.meta.url),
  "utf8",
);
const uploadRoute = readFileSync(
  new URL("../app/api/try-ons/upload-intent/route.ts", import.meta.url),
  "utf8",
);
const generationRoute = readFileSync(
  new URL("../app/api/try-ons/route.ts", import.meta.url),
  "utf8",
);
const draftProvider = readFileSync(
  new URL("../components/try-on-draft-provider.tsx", import.meta.url),
  "utf8",
);

describe("beden duyarlı çoklu prova migrasyonu", () => {
  it("üst/pantolon bedeni alanlarını doğrulanmış profil RPC'sine ekler", () => {
    expect(migration).toContain("usual_top_size text");
    expect(migration).toContain("usual_bottom_size text");
    expect(migration).toContain("bottom_size_system text not null default 'EU'");
    expect(migration).toContain("p_usual_top_size text");
    expect(migration).toContain("p_usual_bottom_size text");
    expect(migration).toContain("p_bottom_size_system text");
    expect(migration).toContain("p_usual_bottom_size ~ '^[0-9]{2}$'");
    expect(migration).toMatch(/grant execute on function public\.update_own_profile\([^)]+\) to authenticated;/);
  });

  it("session ve beden/görünüm varyantlarını ayrı, kullanıcıya ait kayıtlar olarak tutar", () => {
    expect(migration).toContain("create table public.try_on_sessions");
    expect(migration).toContain("selected_sizes text[] not null");
    expect(migration).toContain("selected_views text[] not null");
    expect(migration).toContain("measurement_snapshot jsonb");
    expect(migration).toContain("recommendation_snapshot jsonb");
    expect(migration).toContain("add column if not exists session_id uuid");
    expect(migration).toContain("add column if not exists selected_size text");
    expect(migration).toContain("add column if not exists photo_view text");
    expect(migration).toContain("try_ons_session_variant_idx");
    expect(migration).toContain('create policy "try_on_sessions_select_own"');
    expect(migration).toContain("grant select on table public.try_on_sessions to authenticated");
  });

  it("en fazla beş varyantı tek transaction içinde atomik olarak rezerve eder", () => {
    expect(migration).toContain("create or replace function public.claim_try_on_batch");
    expect(migration).toContain("fixed_monthly_limit constant integer := 5");
    expect(migration).toContain("variant_count < 1 or variant_count > fixed_monthly_limit");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("current_count + variant_count > fixed_monthly_limit");
    expect(migration).toContain("duplicate request id");
    expect(migration).toContain("duplicate variant");
    expect(migration).toContain("insert into public.try_on_sessions");
    expect(migration).toContain("insert into public.try_on_usage");
  });

  it("batch RPC'sini browser rollerine kapatır ve tamamlanınca beden metadatasını korur", () => {
    expect(migration).toMatch(/revoke all on function public\.claim_try_on_batch\([^;]+\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.claim_try_on_batch\([^;]+\) to service_role;/);
    const completion = migration.slice(migration.indexOf("create or replace function public.complete_try_on_generation"));
    expect(completion).not.toContain("fit_score = null");
    expect(completion).not.toContain("size_recommendation = null");
  });

  it("idempotent batch retry'ında değişmiş beden/prompt metadatasını reddeder", () => {
    expect(migration).toContain("stored_row.fit_intent <> p_fit_intents[index_value]");
    expect(migration).toContain("stored_row.fit_score <> p_fit_scores[index_value]");
    expect(migration).toContain("stored_row.size_recommendation <> p_size_recommendations[index_value]");
    expect(migration).toContain("stored_row.provider_model <> p_provider_models[index_value]");
    expect(migration).toContain("stored_row.status = 'completed' and stored_row.source_path is null");
  });

  it("kombin gruplarını ve session kapak sahipliğini RLS ile sınırlar", () => {
    expect(migration).toContain("create table public.look_groups");
    expect(migration).toContain('create policy "look_groups_select_own"');
    expect(migration).toContain('create policy "look_groups_insert_own"');
    expect(migration).toContain("add column if not exists try_on_session_id uuid");
    expect(migration).toContain("add column if not exists cover_try_on_id uuid");
    expect(migration).toContain("session_id = try_on_session_id");
    expect(hardeningMigration).toContain("try_on_session_id is not null and exists");
    expect(hardeningMigration).toContain("where id = try_on_session_id and user_id = (select auth.uid())");
  });

  it("pantolon bedeni cast'ini regex başarısına bağlar", () => {
    expect(hardeningMigration).toContain("case when usual_bottom_size ~ '^[0-9]{2}$' then");
    expect(hardeningMigration).toContain("case when p_usual_bottom_size ~ '^[0-9]{2}$' then");
  });

  it("route manifesti beden ve görünümü server kayıtlarıyla birebir doğrular", () => {
    expect(uploadRoute).toContain("variants: z.array(variantSchema).min(1).max(maxVariants)");
    expect(uploadRoute).toContain("NORMAL_TRY_ON_BATCH_LIMIT");
    expect(uploadRoute).toContain("TEST_TRY_ON_BATCH_LIMIT");
    expect(uploadRoute).toContain('adminClient.rpc("claim_try_on_batch"');
    expect(generationRoute).toContain("row.session_id !== input.sessionId");
    expect(generationRoute).toContain("row.selected_size !== input.size");
    expect(generationRoute).toContain("row.photo_view !== input.view");
    expect(generationRoute).toContain("readCatalogGarmentImage(product.id, input.view)");
  });

  it("taslağı kullanıcı ve sürüm bazında saklar, fotoğraf/signed URL içeriğini serialize etmez", () => {
    expect(draftProvider).toContain("TRY_ON_DRAFT_STORAGE_VERSION");
    expect(draftProvider).toContain("encodeURIComponent(userId)");
    expect(draftProvider).toContain("window.sessionStorage.setItem");
    expect(draftProvider).toContain('type PersistedVariant = Omit<TryOnDraftVariant, "imageUrl" | "error">');
    expect(draftProvider).not.toMatch(/JSON\.stringify\(state\)/);
  });
});
