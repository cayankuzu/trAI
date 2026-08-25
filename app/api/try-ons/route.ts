import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateFalTryOn } from "@/lib/ai/fal-try-on";
import { mapFalResultDownloadError, TryOnProviderError } from "@/lib/ai/fal-errors";
import { downloadFalResultImage } from "@/lib/ai/fal-result-image";
import { stableTryOnSeed } from "@/lib/ai/fal-seed";
import {
  fashnCategoryForProduct,
  isFalTryOnEndpoint,
  tryOnRenderModeForEndpoint,
} from "@/lib/ai/fal-endpoints";
import { checkRateLimit } from "@/lib/rate-limit";
import { readBoundedJson } from "@/lib/http/read-json-body";
import {
  detectImageType,
  ExternalImageError,
  matchesStorageImageExtension,
  type SafeImage,
} from "@/lib/security/external-images";
import { inspectGeneratedImage } from "@/lib/security/generated-image-sanity";
import { inspectPersonImage } from "@/lib/security/person-image-sanity";
import { getCatalogProduct } from "@/lib/product-catalog";
import { CatalogProductError, readCatalogGarmentImage } from "@/lib/product-catalog-server";
import { createFitRenderSpec, type FitRenderProfile } from "@/lib/fit-render-spec";
import { isTopSize } from "@/lib/size-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isTryOnUnlimitedTestMode } from "@/lib/try-on-test-mode";
import {
  removeAndFinalizeTryOnStorageCleanup,
  removeOwnedTryOnStoragePaths,
  type TryOnStorageCleanupResult,
} from "@/lib/supabase/try-on-storage-cleanup";
import type { FitIntent, TryOnResult, TryOnView } from "@/lib/types";
import { MAX_PHOTO_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_JSON_REQUEST_BYTES = 64 * 1024;
const tryOnRequestSchema = z.object({
  sessionId: z.string().uuid(),
  productId: z.string().trim().min(1).max(120),
  requestId: z.string().uuid(),
  size: z.string().trim().min(1).max(10),
  view: z.enum(["front", "back"]),
}).strict();

const tryOnRestoreQuerySchema = z.object({
  sessionId: z.string().uuid(),
}).strict();

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type ExistingTryOn = {
  id: string;
  session_id: string | null;
  status: "processing" | "completed" | "failed";
  source_path: string | null;
  garment_path: string | null;
  result_path: string | null;
  product_url: string;
  created_at: string;
  selected_size: string | null;
  photo_view: TryOnView | null;
  fit_intent: FitIntent | null;
  fit_score: number | null;
  size_recommendation: string | null;
  provider_model: string | null;
};

type ExistingTryOnSession = {
  id: string;
  product_id: string;
  product_url: string;
  measurement_snapshot: unknown;
};

class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

function positiveSnapshotNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function fitProfileFromSnapshot(value: unknown): FitRenderProfile {
  const snapshot = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const usualTopSize = typeof snapshot.usualTopSize === "string" && isTopSize(snapshot.usualTopSize)
    ? snapshot.usualTopSize
    : null;
  const usualBottomSize = typeof snapshot.usualBottomSize === "string"
    && snapshot.usualBottomSize.trim().length <= 10
    ? snapshot.usualBottomSize.trim()
    : null;

  return {
    chestCm: positiveSnapshotNumber(snapshot.chestCm),
    waistCm: positiveSnapshotNumber(snapshot.waistCm),
    hipCm: positiveSnapshotNumber(snapshot.hipCm),
    usualTopSize,
    usualBottomSize,
  };
}

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isExpectedPath(
  path: string,
  userId: string,
  requestId: string,
  kind: "person" | "garment-og" | "result",
) {
  const prefix = `${userId}/${requestId}/${kind}.`;
  return path.startsWith(prefix) && ["jpg", "png", "webp"].includes(path.slice(prefix.length));
}

function cleanupDependencies(adminClient: SupabaseAdminClient) {
  return {
    remove: async (paths: string[]) => {
      const { error } = await adminClient.storage.from("user-photos").remove(paths);
      return { error };
    },
    finalize: async ({ userId, requestId }: { userId: string; requestId: string }) => {
      const { data, error } = await adminClient.rpc("finalize_try_on_input_cleanup", {
        p_user_id: userId,
        p_request_id: requestId,
      });
      return { data, error };
    },
  };
}

function logDeferredCleanup(requestId: string, result: TryOnStorageCleanupResult) {
  if (result.ok) return;
  console.error("Try-on Storage cleanup deferred.", {
    requestId,
    stage: result.stage,
    error: result.error instanceof Error ? result.error.message : result.error,
  });
}

async function removeAndFinalizeTryOnInputs(
  adminClient: SupabaseAdminClient,
  userId: string,
  requestId: string,
  paths: Iterable<string>,
) {
  const result = await removeAndFinalizeTryOnStorageCleanup(cleanupDependencies(adminClient), {
    userId,
    requestId,
    paths,
  });
  logDeferredCleanup(requestId, result);
}

async function removeRetryableTryOnResult(
  adminClient: SupabaseAdminClient,
  userId: string,
  requestId: string,
  resultPath: string,
) {
  const result = await removeOwnedTryOnStoragePaths(cleanupDependencies(adminClient), {
    userId,
    requestId,
    paths: [resultPath],
  });
  logDeferredCleanup(requestId, result);
}

async function downloadPrivateImage(
  adminClient: SupabaseAdminClient,
  path: string,
  label = "Yüklenen fotoğraf",
): Promise<SafeImage> {
  const { data, error } = await adminClient.storage.from("user-photos").download(path);
  if (error || !data) {
    throw new RouteError(`${label} güvenli depodan okunamadı.`, 422, "stored_photo_missing");
  }
  if (data.size > MAX_PHOTO_BYTES) {
    throw new RouteError(`${label} en fazla 6 MB olabilir.`, 413, "stored_photo_too_large");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected || !matchesStorageImageExtension(path, detected.extension)) {
    throw new RouteError(`${label} geçerli bir JPG, PNG veya WebP görsel değil.`, 422, "stored_photo_invalid");
  }
  return { bytes, ...detected };
}

async function assertVisibleGeneratedImage(image: SafeImage) {
  let inspection: Awaited<ReturnType<typeof inspectGeneratedImage>>;
  try {
    inspection = await inspectGeneratedImage(image.bytes);
  } catch {
    throw new TryOnProviderError(
      "provider_output",
      "Sanal prova servisi okunabilir bir sonuç görseli döndürmedi. Yeni bir prova başlat.",
      502,
    );
  }
  if (inspection.almostEntirelyBlack) {
    throw new TryOnProviderError(
      "provider_output",
      "Sanal prova servisi görünür bir sonuç üretmedi. Bu çıktı gösterilmeyecek; yeni bir prova başlatmadan önce sonuç kartındaki kullanılabilir seçenekleri kontrol et.",
      502,
    );
  }
}

async function assertUsablePersonImage(image: SafeImage) {
  let inspection: Awaited<ReturnType<typeof inspectPersonImage>>;
  try {
    inspection = await inspectPersonImage(image.bytes);
  } catch {
    throw new RouteError(
      "Yüklenen kişi fotoğrafı güvenli biçimde çözümlenemedi. Fotoğrafı yeniden dışa aktarıp tekrar dene.",
      422,
      "stored_photo_invalid",
    );
  }
  if (!inspection.acceptable) {
    throw new RouteError(
      "Yüklenen kişi fotoğrafının çözünürlüğü veya görünür içeriği prova için uygun değil. En az 320 px kısa kenarlı, en fazla 32 MP net bir fotoğraf kullan.",
      422,
      "stored_photo_invalid",
    );
  }
}

async function uploadImage(adminClient: SupabaseAdminClient, path: string, image: SafeImage) {
  const { error } = await adminClient.storage.from("user-photos").upload(path, image.bytes, {
    contentType: image.contentType,
    // Bu yollar yalnız server-side RPC tarafından ilgili kullanıcı/istek için hazırlanır.
    // Aynı provider isteğinin retry'ında önceki upload yanıtı kaybolmuşsa overwrite,
    // deterministik yolun kalıcı bir "Asset Already Exists" döngüsüne girmesini önler.
    upsert: true,
  });
  if (error) throw new RouteError("Fotoğraf güvenli depoya yüklenemedi.", 502, "storage_upload");
}

async function signedImageUrl(adminClient: SupabaseAdminClient, path: string) {
  const { data, error } = await adminClient.storage.from("user-photos").createSignedUrl(path, 60 * 15);
  if (error || !data?.signedUrl) {
    throw new RouteError("Fotoğraf prova servisine güvenli biçimde hazırlanamadı.", 502, "storage_sign");
  }
  return data.signedUrl;
}

async function completedResult(adminClient: SupabaseAdminClient, row: ExistingTryOn): Promise<TryOnResult | null> {
  if (row.status !== "completed" || !row.result_path) return null;
  const storedResult = await downloadPrivateImage(adminClient, row.result_path, "Prova sonucu");
  await assertVisibleGeneratedImage(storedResult);
  return {
    id: row.id,
    sessionId: row.session_id ?? "",
    imageUrl: await signedImageUrl(adminClient, row.result_path),
    productUrl: row.product_url,
    createdAt: row.created_at,
    size: row.selected_size ?? "",
    view: row.photo_view ?? "front",
    fitIntent: row.fit_intent ?? "regular",
    fitScore: row.fit_score,
    sizeRecommendation: row.size_recommendation,
    renderMode: tryOnRenderModeForEndpoint(row.provider_model),
  };
}

async function requireTryOnMutation(
  adminClient: SupabaseAdminClient,
  userId: string,
  functionName:
    | "prepare_try_on_garment"
    | "prepare_try_on_result"
    | "complete_try_on_generation"
    | "fail_try_on_generation",
  args: Record<string, string>,
  message: string,
) {
  const { data, error } = await adminClient.rpc(functionName, { p_user_id: userId, ...args });
  if (error || data !== true) {
    throw new RouteError(message, 502, "database_write");
  }
}

function apiError(error: unknown, retrySameRequest = false) {
  if (error instanceof TryOnProviderError) {
    if (error.code === "provider_submit_uncertain") {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        retrySameRequest: false,
        actionHref: "/support",
      }, { status: error.status });
    }
    return NextResponse.json({ error: error.message, code: error.code, retrySameRequest }, { status: error.status });
  }
  if (error instanceof RouteError) {
    return NextResponse.json({ error: error.message, code: error.code, retrySameRequest }, { status: error.status });
  }
  if (error instanceof CatalogProductError) {
    return NextResponse.json({ error: error.message, code: error.code, retrySameRequest }, { status: 422 });
  }
  if (error instanceof ExternalImageError) {
    return NextResponse.json({
      error: "Prova servisinin sonuç görseli güvenli biçimde alınamadı. Tekrar dene.",
      code: error.code,
      retrySameRequest,
    }, { status: 422 });
  }
  return NextResponse.json(
    { error: "Sanal prova oluşturulamadı. Biraz sonra tekrar dene.", code: "unknown", retrySameRequest },
    { status: 500 },
  );
}

/**
 * Restores fresh, short-lived URLs for results that are already complete.
 * This endpoint is deliberately read-only: it never starts a provider job,
 * changes quota, or recreates a failed result.
 */
export async function GET(request: NextRequest) {
  const parsed = tryOnRestoreQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Prova oturumu geçersiz.", code: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const authClient = await createClient();
  if (!authClient) {
    return NextResponse.json(
      { error: "Güvenli kullanıcı deposu yapılandırılmalı.", code: "storage_config" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json(
      { error: "Oturumun sona erdi. Yeniden giriş yap.", code: "auth_expired" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Güvenli prova sunucusu yapılandırılmalı.", code: "server_config" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data, error } = await adminClient
    .from("try_ons")
    .select("id,session_id,status,source_path,garment_path,result_path,product_url,created_at,selected_size,photo_view,fit_intent,fit_score,size_recommendation,provider_model")
    .eq("user_id", userId)
    .eq("session_id", parsed.data.sessionId)
    .eq("status", "completed")
    .not("result_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(24);
  if (error) {
    return NextResponse.json(
      { error: "Prova sonuçları yenilenemedi.", code: "database_read" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const rows = (data ?? []) as ExistingTryOn[];
    for (const row of rows) {
      if (!row.result_path || !isExpectedPath(row.result_path, userId, row.id, "result")) {
        throw new RouteError("Kayıtlı prova sonucu geçersiz.", 422, "stored_photo_invalid");
      }
    }
    const settled = await Promise.allSettled(rows.map((row) => completedResult(adminClient, row)));
    const restored = settled.flatMap((item) => (
      item.status === "fulfilled" && item.value ? [item.value] : []
    ));
    const failedCount = settled.length - restored.length;
    if (rows.length > 0 && restored.length === 0 && failedCount > 0) {
      const firstFailure = settled.find(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      throw firstFailure?.reason ?? new RouteError(
        "Prova sonuçları geçici olarak yenilenemedi.",
        502,
        "storage_download",
      );
    }
    return NextResponse.json(
      { data: restored, partial: failedCount > 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (restoreError) {
    const response = apiError(restoreError, false);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(request: NextRequest) {
  const unlimitedTestMode = isTryOnUnlimitedTestMode();
  if (!unlimitedTestMode) {
    // Normal modda maliyet kotasına ek olarak kısa süreli istek patlamalarını da sınırla.
    const limit = checkRateLimit(`try-on:${clientKey(request)}`, 12, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Çok fazla prova isteği gönderdin. Bir dakika sonra tekrar dene.",
          code: "rate_limit",
          retrySameRequest: true,
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
  }

  const body = await readBoundedJson(request, MAX_JSON_REQUEST_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "İstek boyutu geçersiz.", code: "request_too_large" }, { status: 413 });
  }
  const parsed = tryOnRequestSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Prova bilgileri geçersiz.", code: "invalid_request" }, { status: 400 });
  }
  const input = parsed.data;
  const product = getCatalogProduct(input.productId);
  if (!product) {
    return NextResponse.json({ error: "Seçilen katalog ürünü bulunamadı.", code: "catalog_product_missing" }, { status: 400 });
  }

  const authClient = await createClient();
  if (!authClient) {
    return NextResponse.json({ error: "Güvenli kullanıcı deposu yapılandırılmalı.", code: "storage_config" }, { status: 503 });
  }
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "Oturumun sona erdi. Yeniden giriş yap.", code: "auth_expired" }, { status: 401 });
  }
  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Güvenli prova sunucusu yapılandırılmalı.", code: "server_config" }, { status: 503 });
  }

  const id = input.requestId;
  let generationAcquired = false;
  let generationLeaseHeld = false;
  let preparedRequest = false;
  let providerRequestId: string | null = null;
  let providerEndpointForLog: string | null = null;
  let resultPathUploaded: string | null = null;
  const cleanupPaths = new Set<string>();

  try {
    preparedRequest = true;
    const { data: rowData, error: rowError } = await adminClient
      .from("try_ons")
      .select("id,session_id,status,source_path,garment_path,result_path,product_url,created_at,selected_size,photo_view,fit_intent,fit_score,size_recommendation,provider_model")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (rowError) throw new RouteError("Prova isteği kontrol edilemedi.", 502, "database_read");
    let row = (rowData as ExistingTryOn | null) ?? null;
    if (!row) throw new RouteError("Önce fotoğrafların için güvenli yükleme alanı oluştur.", 409, "upload_required");

    const { data: sessionData, error: sessionError } = await adminClient
      .from("try_on_sessions")
      .select("id,product_id,product_url,measurement_snapshot")
      .eq("id", input.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionError) {
      throw new RouteError("Prova oturumu kontrol edilemedi.", 502, "database_read");
    }
    const session = (sessionData as ExistingTryOnSession | null) ?? null;
    if (
      !session
      || session.product_id !== product.id
      || session.product_url !== product.sourceUrl
    ) {
      throw new RouteError("Bu prova oturumu farklı bir katalog ürünü için kullanılamaz.", 409, "request_input_mismatch");
    }

    if (row.product_url !== product.sourceUrl) {
      throw new RouteError("Bu istek kimliği farklı bir ürün için kullanılamaz.", 409, "request_input_mismatch");
    }
    const providerEndpoint = row.provider_model;
    if (
      row.session_id !== input.sessionId
      || row.selected_size !== input.size
      || row.photo_view !== input.view
      || !isFalTryOnEndpoint(providerEndpoint)
    ) {
      throw new RouteError("Bu istek kimliği farklı bir beden veya görünüm için kullanılamaz.", 409, "request_input_mismatch");
    }
    providerEndpointForLog = providerEndpoint;
    if (!product.availableSizes.includes(input.size)) {
      throw new RouteError("Seçilen beden bu üründe bulunmuyor.", 400, "catalog_size_missing");
    }
    const ready = await completedResult(adminClient, row);
    if (ready) return NextResponse.json({ data: ready, mode: "fal", reused: true });
    if (row.status === "failed") {
      throw new RouteError("Bu prova denemesi tamamlanamadı. Yeni bir deneme başlat.", 409, "request_failed");
    }
    if (!row.source_path || !isExpectedPath(row.source_path, userId, id, "person")) {
      throw new RouteError("Kişi fotoğrafı kaydı geçersiz.", 422, "stored_photo_invalid");
    }
    cleanupPaths.add(row.source_path);
    if (row.garment_path) cleanupPaths.add(row.garment_path);

    if (!process.env.FAL_KEY?.trim()) {
      throw new RouteError("Sanal prova servisi henüz etkinleştirilmedi.", 503, "provider_config");
    }

    const { data: beginData, error: beginError } = await adminClient.rpc("begin_try_on_generation", {
      p_user_id: userId,
      p_request_id: id,
    });
    if (beginError) throw new RouteError("Prova işlemi güvenli biçimde başlatılamadı.", 502, "database_write");
    const begin = (beginData as Array<{ outcome: string; provider_request_id: string | null }> | null)?.[0];
    if (begin?.outcome === "busy") {
      throw new RouteError("Bu prova isteği hazırlanıyor. Birkaç saniye sonra tekrar dene.", 409, "request_processing");
    }
    if (begin?.outcome === "quota_exceeded") {
      await requireTryOnMutation(
        adminClient,
        userId,
        "fail_try_on_generation",
        { p_request_id: id, p_error_code: "quota_exceeded" },
        "Prova isteği güvenli biçimde kapatılamadı.",
      );
      await removeAndFinalizeTryOnInputs(adminClient, userId, id, cleanupPaths);
      throw new RouteError("Aylık ücretsiz prova hakkın doldu.", 429, "quota_exceeded");
    }
    if (begin?.outcome === "existing" && begin.provider_request_id) {
      providerRequestId = begin.provider_request_id;
      generationLeaseHeld = true;
    } else if (begin?.outcome === "acquired") {
      generationAcquired = true;
      generationLeaseHeld = true;
    } else {
      throw new RouteError("Prova işlemi başlatılamadı.", 409, "request_conflict");
    }

    let garmentPhotoType = product.renderingProfile.garmentPhotoType;
    if (generationAcquired) {
      const garmentImage = await readCatalogGarmentImage(product.id, input.view);
      garmentPhotoType = garmentImage.garmentPhotoType;
      const selectedGarmentPath = `${userId}/${id}/garment-og.${garmentImage.extension}`;
      await requireTryOnMutation(
        adminClient,
        userId,
        "prepare_try_on_garment",
        { p_request_id: id, p_garment_path: selectedGarmentPath },
        "Kıyafet görseli hazırlanamadı.",
      );
      await uploadImage(adminClient, selectedGarmentPath, garmentImage);
      cleanupPaths.add(selectedGarmentPath);

      row = { ...row, garment_path: selectedGarmentPath };
    }

    if (!row.source_path || !isExpectedPath(row.source_path, userId, id, "person")) {
      throw new RouteError("Kişi fotoğrafı kaydı geçersiz.", 422, "stored_photo_invalid");
    }
    if (!row.garment_path || !isExpectedPath(row.garment_path, userId, id, "garment-og")) {
      throw new RouteError("Kıyafet fotoğrafı kaydı geçersiz.", 422, "stored_photo_invalid");
    }
    const sourcePath = row.source_path;
    const garmentPath = row.garment_path;
    const sourceImage = await downloadPrivateImage(adminClient, sourcePath);
    await assertUsablePersonImage(sourceImage);

    const [personImageUrl, clothingImageUrl] = await Promise.all([
      signedImageUrl(adminClient, sourcePath),
      signedImageUrl(adminClient, garmentPath),
    ]);
    const selectedSize = row.selected_size ?? input.size;
    const selectedView = row.photo_view ?? input.view;
    const fitRenderSpec = createFitRenderSpec(
      fitProfileFromSnapshot(session.measurement_snapshot),
      product,
      selectedSize,
    );
    const generated = await generateFalTryOn({
      endpoint: providerEndpoint,
      personImageUrl,
      clothingImageUrl,
      garmentCategory: fashnCategoryForProduct(product.categoryKey),
      garmentPhotoType,
      seed: stableTryOnSeed(input.sessionId, selectedView),
      fit: {
        productTitle: product.title,
        category: product.category,
        selectedSize,
        view: selectedView,
        fitIntent: row.fit_intent ?? "regular",
        color: product.color,
        material: product.renderingProfile.materialDescription,
        declaredFit: product.renderingProfile.silhouetteDescription,
        visualDescription: product.renderingProfile.viewDescriptions[selectedView] ?? product.description,
        renderSpec: fitRenderSpec,
      },
      existingRequestId: providerRequestId,
      onSubmitted: async (nextProviderRequestId) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const { error } = await adminClient.rpc("record_try_on_provider_request", {
            p_user_id: userId,
            p_request_id: id,
            p_provider_request_id: nextProviderRequestId,
          });
          if (!error) {
            providerRequestId = nextProviderRequestId;
            return;
          }
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
        throw new RouteError("Prova kuyruğu kaydedilemedi.", 502, "database_write");
      },
    });

    let resultImage: SafeImage;
    try {
      resultImage = await downloadFalResultImage(generated.imageUrl);
    } catch (error) {
      if (error instanceof ExternalImageError) {
        throw mapFalResultDownloadError(error.code);
      }
      throw error;
    }
    await assertVisibleGeneratedImage(resultImage);
    const resultPath = `${userId}/${id}/result.${resultImage.extension}`;
    await requireTryOnMutation(
      adminClient,
      userId,
      "prepare_try_on_result",
      { p_request_id: id, p_result_path: resultPath },
      "Prova sonucu için güvenli alan hazırlanamadı.",
    );
    await uploadImage(adminClient, resultPath, resultImage);
    resultPathUploaded = resultPath;
    const signedResultUrl = await signedImageUrl(adminClient, resultPath);

    await requireTryOnMutation(
      adminClient,
      userId,
      "complete_try_on_generation",
      {
        p_request_id: id,
        p_provider_request_id: generated.requestId,
        p_result_path: resultPath,
      },
      "Prova sonucu kaydedilemedi.",
    );

    const result: TryOnResult = {
      id,
      sessionId: row.session_id ?? input.sessionId,
      imageUrl: signedResultUrl,
      productUrl: row.product_url,
      createdAt: row.created_at,
      size: row.selected_size ?? input.size,
      view: row.photo_view ?? input.view,
      fitIntent: row.fit_intent ?? "regular",
      fitScore: row.fit_score,
      sizeRecommendation: row.size_recommendation,
      renderMode: tryOnRenderModeForEndpoint(row.provider_model),
    };
    cleanupPaths.add(sourcePath);
    cleanupPaths.add(garmentPath);
    const completedCleanupPaths = [...cleanupPaths];
    after(() => removeAndFinalizeTryOnInputs(
      adminClient,
      userId,
      id,
      completedCleanupPaths,
    ));
    return NextResponse.json({ data: result, mode: "fal" });
  } catch (error) {
    const code = error instanceof TryOnProviderError || error instanceof RouteError || error instanceof ExternalImageError || error instanceof CatalogProductError
      ? error.code
      : "unknown";
    if (error instanceof TryOnProviderError) {
      console.warn("[try-on generation] provider failure", {
        endpoint: providerEndpointForLog,
        code: error.code,
        status: error.status,
        providerRequestRecorded: Boolean(providerRequestId),
      });
    }
    const retrySameRequest = code === "request_processing" || (
      preparedRequest && [
        "provider_config",
        "provider_timeout",
        "provider_unavailable",
        "provider_rate_limit",
        "provider_result_unavailable",
        "database_read",
        "database_write",
        "storage_upload",
        "storage_sign",
        "unknown",
      ].includes(code)
    );

    let stateTransitionFailed = false;
    if (generationLeaseHeld && !retrySameRequest) {
      const { data, error: transitionError } = await adminClient.rpc("fail_try_on_generation", {
        p_user_id: userId,
        p_request_id: id,
        p_error_code: code,
      });
      stateTransitionFailed = Boolean(transitionError) || data !== true;
    } else if (generationLeaseHeld) {
      const { data, error: transitionError } = await adminClient.rpc("record_try_on_retryable_error", {
        p_user_id: userId,
        p_request_id: id,
        p_error_code: code,
        // Keep the deterministic result path in the row until Storage removal
        // succeeds. A retry can safely overwrite the same owned path.
        p_clear_result: false,
      });
      stateTransitionFailed = Boolean(transitionError) || data !== true;
    }
    if (stateTransitionFailed) {
      if (code === "provider_submit_uncertain") {
        return NextResponse.json({
          error: "Sağlayıcı isteğinin durumu kesinleştirilemedi. İkinci kez ücretlenmemek için aynı isteği veya yeni bir provayı otomatik başlatma; Fal işlem/kredi durumunu kontrol et.",
          code,
          retrySameRequest: false,
          actionHref: "/support",
        }, { status: 503 });
      }
      return apiError(
        new RouteError("Prova durumu güvenli biçimde kaydedilemedi. Aynı isteği tekrar dene.", 502, "database_write"),
        true,
      );
    }
    if (generationLeaseHeld && !retrySameRequest && code !== "provider_submit_uncertain") {
      const terminalCleanupPaths = new Set(cleanupPaths);
      if (resultPathUploaded) terminalCleanupPaths.add(resultPathUploaded);
      if (terminalCleanupPaths.size > 0) {
        await removeAndFinalizeTryOnInputs(adminClient, userId, id, terminalCleanupPaths);
      }
    } else if (generationLeaseHeld && code === "provider_submit_uncertain") {
      // The provider may have accepted the job before its response was lost.
      // Keep the signed inputs briefly so that an already-billed job can fetch
      // them; the service-only stale cleanup lease removes them after 5 minutes.
    } else if (generationLeaseHeld && resultPathUploaded) {
      // Retryable failures keep person/garment inputs and their DB metadata.
      // Only a newly uploaded result is removed; p_clear_result remains false.
      await removeRetryableTryOnResult(adminClient, userId, id, resultPathUploaded);
    }
    if (code === "quota_exceeded") {
      return NextResponse.json({
        error: "Aylık ücretsiz prova hakkın doldu.",
        code,
        retrySameRequest: false,
        actionHref: "/states/quota-reached",
      }, { status: 429 });
    }
    return apiError(error, retrySameRequest);
  }
}
