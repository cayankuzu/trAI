import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { falTryOnEndpointForMode, tryOnRenderModeForEndpoint } from "@/lib/ai/fal-endpoints";
import { getFitRecommendation } from "@/lib/fit-recommendation";
import { readBoundedJson } from "@/lib/http/read-json-body";
import { getCatalogProduct } from "@/lib/product-catalog";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTryOnQuotaSnapshot, tryOnQuotaExceededMessage } from "@/lib/try-on-quota";
import {
  isTryOnUnlimitedTestMode,
  NORMAL_TRY_ON_BATCH_LIMIT,
  TEST_TRY_ON_BATCH_LIMIT,
} from "@/lib/try-on-test-mode";
import type { FitIntent, ProfileData, TryOnView } from "@/lib/types";
import { MAX_PHOTO_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const imageFileSchema = z.object({
  kind: z.literal("person"),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(MAX_PHOTO_BYTES),
}).strict();

const variantSchema = z.object({
  requestId: z.string().uuid(),
  size: z.string().trim().min(1).max(10),
  view: z.enum(["front", "back"]),
  file: imageFileSchema,
}).strict();

function uploadIntentSchema(maxVariants: number) {
  return z.object({
    sessionId: z.string().uuid(),
    productId: z.string().trim().min(1).max(120),
    providerMode: z.enum(["primary", "safety_fallback", "garment_fidelity", "fit_aware"]).optional(),
    variants: z.array(variantSchema).min(1).max(maxVariants),
  }).strict().superRefine((value, context) => {
    const requestIds = new Set(value.variants.map((variant) => variant.requestId));
    if (requestIds.size !== value.variants.length) {
      context.addIssue({ code: "custom", path: ["variants"], message: "İstek kimlikleri benzersiz olmalı." });
    }
    const variantKeys = new Set(value.variants.map((variant) => `${variant.size}:${variant.view}`));
    if (variantKeys.size !== value.variants.length) {
      context.addIssue({ code: "custom", path: ["variants"], message: "Aynı beden ve görünüm iki kez seçilemez." });
    }
  });
}

type ImageContentType = "image/jpeg" | "image/png" | "image/webp";
type ClaimResult = {
  request_id: string | null;
  outcome: string;
  used_count: number | string;
  limit_count: number;
  person_path: string | null;
};

type PostgrestErrorShape = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type StaleCleanupClaim = { request_id: string; cleanup_paths: string[] | null };

function expectedCleanupPaths(userId: string, requestId: string, paths: string[] | null) {
  const prefix = `${userId}/${requestId}/`;
  return [...new Set((paths ?? []).filter((path) => {
    if (!path.startsWith(prefix)) return false;
    const file = path.slice(prefix.length);
    return /^(person|garment-upload|garment-og|result)\.(jpg|png|webp)$/.test(file);
  }))];
}

async function cleanupStaleUploads(adminClient: SupabaseAdminClient, userId: string) {
  const { data, error } = await adminClient.rpc("claim_stale_try_on_cleanup", {
    p_user_id: userId,
    p_limit: 10,
  });
  if (error) {
    // 008 henüz uygulanmamış bir ortamda ana prova akışını engelleme.
    console.error("[try-on cleanup] stale claim failed", { code: error.code });
    return;
  }

  for (const claim of (data as StaleCleanupClaim[] | null) ?? []) {
    const paths = expectedCleanupPaths(userId, claim.request_id, claim.cleanup_paths);
    if (paths.length === 0) continue;
    const { error: removeError } = await adminClient.storage.from("user-photos").remove(paths);
    if (removeError) {
      console.error("[try-on cleanup] storage removal failed", { requestId: claim.request_id });
      continue;
    }
    const { error: finalizeError } = await adminClient.rpc("finalize_try_on_input_cleanup", {
      p_user_id: userId,
      p_request_id: claim.request_id,
    });
    if (finalizeError) {
      console.error("[try-on cleanup] finalize failed", { requestId: claim.request_id, code: finalizeError.code });
    }
  }
}

function extensionFor(contentType: ImageContentType) {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function claimErrorResponse(error: PostgrestErrorShape) {
  const code = normalizeText(error.code);
  const combined = [error.message, error.details, error.hint].map(normalizeText).join(" ");
  if (combined.includes("daily reservation limit reached")) {
    return NextResponse.json({
      error: "Çok fazla tamamlanmamış yükleme isteği var. Yarın yeniden deneyebilirsin.",
      code: "daily_reservation_limit",
      retrySameRequest: false,
    }, { status: 429 });
  }
  if (
    code === "pgrst202"
    || code === "42883"
    || combined.includes("claim_try_on_batch")
    || combined.includes("try_on_sessions")
    || combined.includes("usual_top_size")
  ) {
    return NextResponse.json({
      error: "Çoklu beden prova altyapısı henüz veritabanına kurulmamış.",
      code: "migration_missing",
      retrySameRequest: false,
    }, { status: 503 });
  }
  if (code === "42501" || combined.includes("permission denied") || combined.includes("service_role required")) {
    return NextResponse.json({
      error: "Prova hakkı denetimi için sunucu yetkisi eksik.",
      code: "service_role_permission",
      retrySameRequest: false,
    }, { status: 503 });
  }
  if (["23502", "23503", "23505", "23514", "22001", "22p02"].includes(code) || combined.includes("invalid ")) {
    return NextResponse.json({
      error: "Beden veya fotoğraf seçiminde geçersiz veri var. Seçimleri yenileyip tekrar dene.",
      code: "invalid_claim_request",
      retrySameRequest: false,
    }, { status: 400 });
  }
  return NextResponse.json({
    error: "Prova hakkın güvenli biçimde kontrol edilemedi. Biraz sonra tekrar dene.",
    code: "claim_check_failed",
    retrySameRequest: true,
  }, { status: 502 });
}

function toProfileData(row: Record<string, unknown>): ProfileData {
  return {
    fullName: "",
    gender: "other",
    heightCm: typeof row.height_cm === "number" ? row.height_cm : null,
    weightKg: typeof row.weight_kg === "number" ? row.weight_kg : null,
    chestCm: typeof row.chest_cm === "number" ? row.chest_cm : null,
    waistCm: typeof row.waist_cm === "number" ? row.waist_cm : null,
    hipCm: typeof row.hip_cm === "number" ? row.hip_cm : null,
    usualTopSize: typeof row.usual_top_size === "string" ? row.usual_top_size as ProfileData["usualTopSize"] : null,
    usualBottomSize: typeof row.usual_bottom_size === "string" ? row.usual_bottom_size : null,
    bottomSizeSystem: row.bottom_size_system === "W" ? "W" : "EU",
  };
}

function providerFitIntent(value: string): FitIntent {
  return value === "fitted" || value === "relaxed" ? value : "regular";
}

export async function POST(request: NextRequest) {
  const unlimitedTestMode = isTryOnUnlimitedTestMode();
  if (!unlimitedTestMode) {
    const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const limit = checkRateLimit(`try-on-upload:${clientKey}`, 12, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({
        error: "Çok fazla yükleme isteği gönderdin. Bir dakika sonra aynı provayı tekrar dene.",
        code: "rate_limit",
        retrySameRequest: true,
      }, { status: 429, headers: { "Retry-After": "60" } });
    }
  }

  const body = await readBoundedJson(request, 48 * 1024);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Yükleme isteği geçersiz." }, { status: 413 });
  }

  const maxVariants = unlimitedTestMode ? TEST_TRY_ON_BATCH_LIMIT : NORMAL_TRY_ON_BATCH_LIMIT;
  const parsed = uploadIntentSchema(maxVariants).safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Yükleme bilgileri geçersiz." }, { status: 400 });
  }
  const input = parsed.data;
  const product = getCatalogProduct(input.productId);
  if (!product) {
    return NextResponse.json({ error: "Seçilen katalog ürünü bulunamadı.", code: "catalog_product_missing" }, { status: 400 });
  }
  if (input.variants.some((variant) => !product.availableSizes.includes(variant.size))) {
    return NextResponse.json({ error: "Seçilen beden bu üründe bulunmuyor.", code: "catalog_size_missing" }, { status: 400 });
  }
  if (input.variants.some((variant) => variant.view === "back") && !product.garmentImages.back) {
    return NextResponse.json({ error: "Bu ürünün arka görünümü katalogda bulunmuyor.", code: "catalog_back_missing" }, { status: 400 });
  }
  const providerEndpoint = falTryOnEndpointForMode(input.providerMode);
  if (
    tryOnRenderModeForEndpoint(providerEndpoint) === "garment-fidelity"
    && new Set(input.variants.map((variant) => variant.size)).size > 1
  ) {
    return NextResponse.json({
      error: "Ürün detayı modu aynı görünüm için fiziksel beden farkı üretmez. Tek beden seç veya Beden görünümü Beta'yı kullan.",
      code: "garment_fidelity_single_size",
      retrySameRequest: false,
    }, { status: 400 });
  }

  const authClient = await createClient();
  if (!authClient) {
    return NextResponse.json({ error: "Güvenli fotoğraf deposu yapılandırılmadı." }, { status: 503 });
  }
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "Oturumun sona erdi. Yeniden giriş yap." }, { status: 401 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Güvenli prova sunucusu yapılandırılmadı." }, { status: 503 });
  }
  // Eski dosya temizliği kullanıcıya upload izni vermek için gerekli değil. Storage
  // silmeleri zaman zaman saniyeler sürdüğünden yanıtı bloke etmeden tamamla.
  after(async () => {
    const startedAt = Date.now();
    try {
      await cleanupStaleUploads(adminClient, userId);
    } catch (error) {
      console.error("[try-on cleanup] background task failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= 2_000) {
        console.info("[try-on cleanup] background task finished", { durationMs });
      }
    }
  });
  if (!process.env.FAL_KEY?.trim()) {
    return NextResponse.json({ error: "Sanal prova servisi henüz etkinleştirilmedi." }, { status: 503 });
  }

  const { data: measurementData, error: measurementError } = await adminClient
    .from("measurements")
    .select("height_cm,weight_kg,chest_cm,waist_cm,hip_cm,usual_top_size,usual_bottom_size,bottom_size_system")
    .eq("user_id", userId)
    .maybeSingle();
  if (measurementError || !measurementData) {
    return NextResponse.json({
      error: "Beden önerisi için profil ölçüleri okunamadı. Profilini kontrol edip tekrar dene.",
      code: "profile_measurements_missing",
    }, { status: 422 });
  }

  const profile = toProfileData(measurementData as Record<string, unknown>);
  const recommendation = getFitRecommendation(profile, product);
  const assessments = new Map(recommendation.assessments.map((assessment) => [assessment.size, assessment]));
  const fitIntents = input.variants.map((variant) => providerFitIntent(assessments.get(variant.size)?.fitIntent ?? "regular"));
  const fitScores = input.variants.map((variant) => assessments.get(variant.size)?.fitScore ?? 0);
  const sizeRecommendations = input.variants.map(() => recommendation.recommendedSize ?? "");
  const { data: claimData, error: claimError } = await adminClient.rpc("claim_try_on_batch", {
    p_user_id: userId,
    p_session_id: input.sessionId,
    p_product_id: product.id,
    p_product_url: product.sourceUrl,
    p_request_ids: input.variants.map((variant) => variant.requestId),
    p_selected_sizes: input.variants.map((variant) => variant.size),
    p_photo_views: input.variants.map((variant) => variant.view),
    p_person_extensions: input.variants.map((variant) => extensionFor(variant.file.contentType)),
    p_fit_intents: fitIntents,
    p_fit_scores: fitScores,
    p_size_recommendations: sizeRecommendations,
    p_provider_models: input.variants.map(() => providerEndpoint),
    p_measurement_snapshot: {
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      chestCm: profile.chestCm,
      waistCm: profile.waistCm,
      hipCm: profile.hipCm,
      usualTopSize: profile.usualTopSize,
      usualBottomSize: profile.usualBottomSize,
      bottomSizeSystem: profile.bottomSizeSystem,
    },
    p_recommendation_snapshot: recommendation,
    p_quota_exempt: unlimitedTestMode,
  });
  if (claimError) {
    console.error("[try-on upload-intent] claim_try_on_batch failed", {
      sessionId: input.sessionId,
      userId,
      code: claimError.code,
      message: claimError.message,
    });
    return claimErrorResponse(claimError as PostgrestErrorShape);
  }

  const claims = (claimData as ClaimResult[] | null) ?? [];
  const outcome = claims[0]?.outcome;
  if (outcome === "quota_exceeded") {
    const quota = getTryOnQuotaSnapshot(
      claims[0]?.used_count,
      claims[0]?.limit_count,
      input.variants.length,
    );
    return NextResponse.json({
      error: tryOnQuotaExceededMessage(quota),
      code: "quota_exceeded",
      ...quota,
      actionHref: "/states/quota-reached",
      retrySameRequest: false,
    }, { status: 429 });
  }
  if (outcome === "request_conflict") {
    return NextResponse.json({
      error: "Bu prova oturumu farklı seçimlerle daha önce kullanılmış. Yeni bir prova başlat.",
      code: "request_conflict",
      retrySameRequest: false,
    }, { status: 409 });
  }
  if (!claims.length || claims.length !== input.variants.length || !claims.every((claim) => ["claimed", "existing"].includes(claim.outcome) && claim.request_id)) {
    return NextResponse.json({ error: "Prova yükleme alanı hazırlanamadı.", code: "claim_incomplete", retrySameRequest: true }, { status: 502 });
  }

  const claimById = new Map(claims.map((claim) => [claim.request_id, claim]));
  const intents = await Promise.all(input.variants.map(async (variant) => {
    const claim = claimById.get(variant.requestId);
    if (!claim?.person_path) return undefined;
    const { data, error } = await adminClient.storage
      .from("user-photos")
      .createSignedUploadUrl(claim.person_path, { upsert: false });
    if (error || !data) return null;
    return {
      requestId: variant.requestId,
      size: variant.size,
      view: variant.view as TryOnView,
      kind: "person" as const,
      path: data.path,
      token: data.token,
      contentType: variant.file.contentType,
    };
  }));
  if (intents.some((intent) => intent === null)) {
    return NextResponse.json({ error: "Güvenli yükleme izni oluşturulamadı.", code: "upload_sign_failed", retrySameRequest: true }, { status: 502 });
  }

  return NextResponse.json({
    data: {
      sessionId: input.sessionId,
      intents: intents.filter((intent) => intent !== undefined),
      recommendation,
      quota: {
        used: Number(claims[0]?.used_count ?? input.variants.length),
        limit: claims[0]?.limit_count ?? 5,
        unlimited: unlimitedTestMode,
      },
    },
  });
}
