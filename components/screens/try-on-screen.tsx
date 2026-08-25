"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { BeforeAfterSlider } from "@/components/try-on/before-after-slider";
import { CatalogBrowser } from "@/components/try-on/catalog-browser";
import { PhotoSourcePicker } from "@/components/try-on/photo-source-picker";
import { ProductImageLightbox } from "@/components/try-on/product-image-lightbox";
import {
  tryOnVariantKey,
  useTryOnDraft,
  type TryOnDraftVariant,
  type TryOnView,
} from "@/components/try-on-draft-provider";
import { getFitRecommendation } from "@/lib/fit-recommendation";
import { analyzePhotoFile, formatPhotoMetadata } from "@/lib/photo-quality";
import { getCatalogProduct, PRODUCT_CATALOG, type CatalogImage } from "@/lib/product-catalog";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { ProfileData, TryOnRenderMode, TryOnResult } from "@/lib/types";

type MessageTone = "idle" | "loading" | "success" | "warning" | "error";
type ImageContentType = "image/jpeg" | "image/png" | "image/webp";
type TryOnProviderMode = "primary" | "safety_fallback" | "garment_fidelity" | "fit_aware";

type UploadIntent = {
  requestId: string;
  size: string;
  view: TryOnView;
  kind: "person";
  path: string;
  token: string;
  contentType: ImageContentType;
};

type UploadIntentPayload = {
  data?: {
    sessionId: string;
    intents: UploadIntent[];
    quota: { used: number; limit: number; unlimited?: boolean };
  };
  error?: string;
  code?: string;
  retrySameRequest?: boolean;
  actionHref?: string;
};

type ApiPayload<T> = {
  data?: T;
  error?: string;
  code?: string;
  retrySameRequest?: boolean;
  actionHref?: string;
};

type LookGroup = {
  id: string;
  name: string;
  lookCount: number;
};

type PlannedVariant = TryOnDraftVariant;

const MAX_RESULTS_PER_BATCH = 5;
const PROVIDER_RESULT_RECOVERY_DELAYS_MS = [2_000] as const;

function waitForAbortableDelay(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function profileFallback(): ProfileData {
  return {
    fullName: "",
    gender: "other",
    heightCm: null,
    weightKg: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    usualTopSize: null,
    usualBottomSize: null,
    bottomSizeSystem: "EU",
  };
}

function variantKeysMatch(current: Record<string, TryOnDraftVariant>, planned: Array<{ size: string; view: TryOnView }>) {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = planned.map((variant) => tryOnVariantKey(variant.size, variant.view)).sort();
  return currentKeys.length === nextKeys.length && currentKeys.every((key, index) => key === nextKeys[index]);
}

function statusLabel(status: TryOnDraftVariant["status"]) {
  if (status === "ready") return "Hazır";
  if (status === "processing") return "Hazırlanıyor";
  if (status === "error") return "Hata";
  if (status === "resume") return "Yeniden başlat";
  return "Sırada";
}

function queuedVariant(
  id: string,
  size: string,
  view: TryOnView,
  previous?: TryOnDraftVariant,
  renderMode?: TryOnRenderMode,
): TryOnDraftVariant {
  return {
    id,
    size,
    view,
    status: "queued",
    imageUrl: null,
    error: null,
    errorCode: null,
    retrySameRequest: true,
    fitIntent: previous?.fitIntent ?? null,
    fitScore: previous?.fitScore ?? null,
    sizeRecommendation: previous?.sizeRecommendation ?? null,
    renderMode: renderMode ?? previous?.renderMode,
  };
}

export function providerModeForRenderMode(mode: TryOnRenderMode): TryOnProviderMode {
  return mode === "fit-aware" ? "fit_aware" : "garment_fidelity";
}

export function variantNeedsGeneration(variant: TryOnDraftVariant) {
  if (variant.status === "ready" && variant.imageUrl) return false;
  if (variant.status === "error" && !variant.retrySameRequest) return false;
  return true;
}

export function variantRequiresProviderReview(variant: TryOnDraftVariant) {
  return variant.errorCode === "provider_submit_uncertain";
}

export function variantIsProviderSafetyFailure(variant: TryOnDraftVariant) {
  return variant.status === "error" && variant.errorCode === "provider_safety";
}

export function variantCanUseGarmentFidelityFallback(variant: TryOnDraftVariant) {
  return variant.renderMode === "fit-aware"
    && variant.status === "error"
    && (variant.errorCode === "provider_safety" || variant.errorCode === "provider_output");
}

export function isAppendOnlyUploadConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  return Number(candidate.statusCode ?? candidate.status) === 409;
}

export function prepareGenerationVariants(planned: TryOnDraftVariant[]) {
  const targets = planned.filter(variantNeedsGeneration);
  const targetIds = new Set(targets.map((variant) => variant.id));
  const variants = planned.map((variant) => targetIds.has(variant.id)
    ? queuedVariant(variant.id, variant.size, variant.view, variant)
    : variant);
  return { targets, targetIds, variants };
}

export function buildTryOnPlan(sizes: string[], views: TryOnView[]) {
  return sizes.flatMap((size) => views.map((view) => ({ size, view })));
}

export function restoredResultToVariant(result: TryOnResult): TryOnDraftVariant {
  return {
    id: result.id,
    size: result.size,
    view: result.view,
    status: "ready",
    imageUrl: result.imageUrl,
    error: null,
    errorCode: null,
    retrySameRequest: false,
    fitIntent: result.fitIntent,
    fitScore: result.fitScore,
    sizeRecommendation: result.sizeRecommendation,
    renderMode: result.renderMode,
  };
}

export function TryOnScreen({ unlimitedTestMode = false }: { unlimitedTestMode?: boolean }) {
  const {
    recentPhotos,
    photoLibraryReady,
    state,
    isBusy,
    setGenerationMode,
    setProductId,
    setSelectedSizes,
    toggleSize,
    toggleView,
    setPhoto,
    selectRecentPhoto,
    deleteRecentPhoto,
    setConsent,
    beginGeneration,
    replaceVariants,
    upsertVariant,
    isCurrentGeneration,
    setActiveSize,
    setActiveView,
    setCompare,
    resetDraft,
    startRequest,
    finishRequest,
  } = useTryOnDraft();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [productExpanded, setProductExpanded] = useState(false);
  const [tone, setTone] = useState<MessageTone>("idle");
  const [message, setMessage] = useState("");
  const [actionHref, setActionHref] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [groups, setGroups] = useState<LookGroup[]>([]);
  const [groupChoice, setGroupChoice] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [restoringResults, setRestoringResults] = useState(false);
  const [inspectingPhoto, setInspectingPhoto] = useState<TryOnView | null>(null);
  const [photoPickerView, setPhotoPickerView] = useState<TryOnView | null>(null);
  const [lightboxImage, setLightboxImage] = useState<CatalogImage | null>(null);
  const lightboxReturnView = useRef<string | null>(null);
  const lightboxWasOpen = useRef(false);
  const autoSizedProduct = useRef("");
  const restoredSessionRef = useRef("");
  const initialHydratedSessionRef = useRef<string | null | undefined>(undefined);
  const resultRefreshControllerRef = useRef<AbortController | null>(null);
  const draftScopeRef = useRef({ sessionId: state.sessionId, epoch: state.generationEpoch });
  draftScopeRef.current = { sessionId: state.sessionId, epoch: state.generationEpoch };

  const selectedProduct = getCatalogProduct(state.productId);
  const recommendation = useMemo(
    () => selectedProduct ? getFitRecommendation(profile ?? profileFallback(), selectedProduct) : null,
    [profile, selectedProduct],
  );
  const assessments = useMemo(
    () => new Map(recommendation?.assessments.map((assessment) => [assessment.size, assessment]) ?? []),
    [recommendation],
  );
  const selectedViews = state.selectedViews;
  const resultCount = state.selectedSizes.length * selectedViews.length;
  const variants = Object.values(state.variants);
  const restoreVariantSignature = variants
    .filter((variant) => variant.status === "ready" || variant.status === "resume")
    .map((variant) => variant.id)
    .sort()
    .join(",");
  const restoreExpectedCount = restoreVariantSignature
    ? restoreVariantSignature.split(",").length
    : 0;
  const readyVariants = variants.filter((variant) => variant.status === "ready" && variant.imageUrl);
  const resultViews = [...new Set(variants.map((variant) => variant.view))];
  const hasRetryableFailure = variants.some(
    (variant) => variant.status === "error" && variant.retrySameRequest,
  );
  const hasFitAwareOutputFailure = variants.some(
    (variant) => variant.renderMode === "fit-aware" && variantCanUseGarmentFidelityFallback(variant),
  );
  const canRetryWithFashn = hasFitAwareOutputFailure
    && state.selectedSizes.length === 1
    && selectedViews.every((view) => Boolean(state.photos[view]));
  const activeVariant = readyVariants.find(
    (variant) => variant.size === state.activeSize && variant.view === state.activeView,
  ) ?? readyVariants[0] ?? null;
  const activePhoto = activeVariant ? state.photos[activeVariant.view] : state.photos[state.activeView];
  const readySizesForView = [...new Set(
    readyVariants.filter((variant) => variant.view === state.activeView).map((variant) => variant.size),
  )];
  const compareLeft = readyVariants.find(
    (variant) => variant.view === state.activeView && variant.size === state.compare.leftSize,
  ) ?? null;
  const compareRight = readyVariants.find(
    (variant) => variant.view === state.activeView && variant.size === state.compare.rightSize,
  ) ?? null;

  const invalidateBlackResult = useCallback((variant: TryOnDraftVariant | null) => {
    if (!variant || !state.sessionId) return;
    const error = "Sağlayıcı görünür bir prova sonucu üretemedi. Mevcut fotoğrafın ve seçimlerin korundu; yeni bir prova deneyebilirsin.";
    upsertVariant(state.sessionId, state.generationEpoch, {
      ...variant,
      status: "error",
      imageUrl: null,
      error,
      errorCode: "provider_output",
      retrySameRequest: false,
    });
    setTone("error");
    setMessage(error);
  }, [state.generationEpoch, state.sessionId, upsertVariant]);

  useEffect(() => {
    if (state.hydrated && !state.productId && PRODUCT_CATALOG[0]) {
      setProductId(PRODUCT_CATALOG[0].id);
    }
  }, [setProductId, state.hydrated, state.productId]);

  useEffect(() => {
    let active = true;
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ApiPayload<ProfileData>;
        if (!response.ok || !payload.data) throw new Error(payload.error || "Profil okunamadı.");
        if (active) setProfile(payload.data);
      })
      .catch(() => {
        if (active) setProfile(profileFallback());
      });
    return () => { active = false; };
  }, []);

  const refreshSessionResults = useCallback(async (announce = true) => {
    const sessionId = state.sessionId;
    const epoch = state.generationEpoch;
    if (!sessionId) {
      if (announce) {
        setTone("warning");
        setMessage("Yenilenecek bir prova sonucu bulunmuyor.");
      }
      return false;
    }

    resultRefreshControllerRef.current?.abort();
    const controller = new AbortController();
    resultRefreshControllerRef.current = controller;
    setRestoringResults(true);

    try {
      const response = await fetch(`/api/try-ons?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as ApiPayload<TryOnResult[]> | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || "Prova sonuçları yenilenemedi.");
      }
      const currentScope = draftScopeRef.current;
      if (
        controller.signal.aborted
        || currentScope.sessionId !== sessionId
        || currentScope.epoch !== epoch
      ) return false;

      let restoredCount = 0;
      for (const result of payload.data) {
        if (result.sessionId !== sessionId) continue;
        upsertVariant(sessionId, epoch, restoredResultToVariant(result));
        restoredCount += 1;
      }
      restoredSessionRef.current = sessionId;
      if (announce) {
        setTone(restoredCount > 0 ? "success" : "warning");
        setMessage(restoredCount > 0
          ? "Prova sonuçların güncellendi."
          : "Henüz tamamlanmış yeni bir sonuç yok; mevcut içeriklerin korundu.");
        setActionHref("");
      }
      return restoredCount;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (restoredSessionRef.current === sessionId) restoredSessionRef.current = "";
      if (announce) {
        setTone("error");
        setMessage(error instanceof Error ? error.message : "Prova sonuçları yenilenemedi.");
        setActionHref("");
      }
      return false;
    } finally {
      if (resultRefreshControllerRef.current === controller) {
        resultRefreshControllerRef.current = null;
        setRestoringResults(false);
      }
    }
  }, [state.generationEpoch, state.sessionId, upsertVariant]);

  useEffect(() => {
    return () => {
      resultRefreshControllerRef.current?.abort();
    };
  }, [state.generationEpoch, state.sessionId]);

  useEffect(() => {
    if (!state.hydrated) return;
    if (initialHydratedSessionRef.current === undefined) {
      initialHydratedSessionRef.current = state.sessionId;
    }
    const initialSessionId = initialHydratedSessionRef.current;
    if (!initialSessionId || state.sessionId !== initialSessionId || !restoreVariantSignature) return;
    if (restoredSessionRef.current === state.sessionId) return;
    restoredSessionRef.current = state.sessionId;
    let cancelled = false;
    let retryTimer: number | null = null;
    let resolveRetryDelay: (() => void) | null = null;
    void (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        const restoredCount = await refreshSessionResults(false);
        if (cancelled) return;
        if (restoredCount !== false && restoredCount >= restoreExpectedCount) return;
        if (attempt === 2) return;
        await new Promise<void>((resolve) => {
          resolveRetryDelay = resolve;
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            resolveRetryDelay = null;
            resolve();
          }, 2_000 * (attempt + 1));
        });
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      resolveRetryDelay?.();
    };
  }, [refreshSessionResults, restoreExpectedCount, restoreVariantSignature, state.hydrated, state.sessionId]);

  useEffect(() => {
    if (!selectedProduct || !profile || autoSizedProduct.current === selectedProduct.id) return;
    autoSizedProduct.current = selectedProduct.id;
    if (state.selectedSizes.length === 0 && recommendation?.recommendedSize) {
      setSelectedSizes([recommendation.recommendedSize]);
    }
  }, [profile, recommendation, selectedProduct, setSelectedSizes, state.selectedSizes.length]);

  useEffect(() => {
    if (!activeVariant) return;
    if (activeVariant.size !== state.activeSize) setActiveSize(activeVariant.size);
    if (activeVariant.view !== state.activeView) setActiveView(activeVariant.view);
  }, [activeVariant, setActiveSize, setActiveView, state.activeSize, state.activeView]);

  useEffect(() => {
    if (readySizesForView.length === 0) return;
    const left = readySizesForView.includes(state.compare.leftSize)
      ? state.compare.leftSize
      : readySizesForView[0];
    const right = readySizesForView.includes(state.compare.rightSize) && state.compare.rightSize !== left
      ? state.compare.rightSize
      : readySizesForView.find((size) => size !== left) ?? left;
    if (left !== state.compare.leftSize || right !== state.compare.rightSize) {
      setCompare({ leftSize: left, rightSize: right });
    }
  }, [readySizesForView, setCompare, state.compare.leftSize, state.compare.rightSize]);

  useEffect(() => {
    if (!saveOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setSaveOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [saveOpen, saving]);

  function clearFeedback() {
    setTone("idle");
    setMessage("");
    setActionHref("");
  }

  function chooseProduct(productId: string) {
    setProductId(productId);
    setProductExpanded(false);
    clearFeedback();
  }

  function chooseSizes(sizes: string[]) {
    if (state.generationMode === "garment-fidelity" && sizes.length > 1) {
      const preferred = recommendation?.recommendedSize && sizes.includes(recommendation.recommendedSize)
        ? recommendation.recommendedSize
        : sizes[0];
      setSelectedSizes(preferred ? [preferred] : []);
      setTone("warning");
      setMessage("Ürün detayı modunda aynı görünüm yalnız bir kez üretilir. Çoklu beden görseli için Beden görünümü Beta'yı seç.");
      setActionHref("");
      return;
    }
    setSelectedSizes(sizes);
    clearFeedback();
  }

  function chooseSize(size: string) {
    if (state.generationMode === "garment-fidelity") {
      setSelectedSizes([size]);
    } else {
      toggleSize(size);
    }
    clearFeedback();
  }

  function chooseGenerationMode(mode: TryOnRenderMode) {
    if (mode === state.generationMode) return;
    const preferred = mode === "garment-fidelity" && state.selectedSizes.length > 1
      ? recommendation?.recommendedSize && state.selectedSizes.includes(recommendation.recommendedSize)
        ? recommendation.recommendedSize
        : state.selectedSizes[0]
      : undefined;
    setGenerationMode(mode, preferred);
    setTone("warning");
    setMessage(mode === "garment-fidelity"
      ? "Ürün detayı öncelikli: baskı, renk ve dokunun korunması önceliklendirilir; fiziksel beden farkı üretilmez."
      : "Beden görünümü Beta: çoklu beden üretilebilir; baskı ve kumaş ayrıntıları değişebilir.");
    setActionHref("");
  }

  function chooseView(view: TryOnView) {
    toggleView(view);
    clearFeedback();
  }

  const closeProductImage = useCallback(() => setLightboxImage(null), []);
  const closePhotoPicker = useCallback(() => setPhotoPickerView(null), []);

  useLayoutEffect(() => {
    if (lightboxImage) {
      lightboxWasOpen.current = true;
      return;
    }
    if (!lightboxWasOpen.current) return;
    lightboxWasOpen.current = false;
    const returnView = lightboxReturnView.current;
    if (returnView) {
      document.querySelector<HTMLButtonElement>(`[data-product-image-trigger="${returnView}"]`)?.focus();
    }
  }, [lightboxImage]);

  function startNewTryOn() {
    resetDraft();
    setSaveOpen(false);
    setSaveError("");
    clearFeedback();
  }

  async function choosePhotoFile(view: TryOnView, file: File) {
    setInspectingPhoto(view);
    try {
      const report = await analyzePhotoFile(file, "person");
      if (!report.accepted) {
        setTone("error");
        setMessage(report.errors[0] || "Fotoğraf doğrulanamadı.");
        return false;
      }
      await setPhoto(view, file);
      if (report.warnings.length > 0) {
        setTone("warning");
        setMessage(`${formatPhotoMetadata(report)} · ${report.warnings[0]}`);
      } else {
        clearFeedback();
      }
      return true;
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Fotoğraf bu cihazda saklanamadı.");
      return false;
    } finally {
      setInspectingPhoto(null);
    }
  }

  async function chooseRecentPhoto(view: TryOnView, photoId: string) {
    try {
      const selected = await selectRecentPhoto(view, photoId);
      if (selected) clearFeedback();
      return selected;
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Önceki fotoğraf seçilemedi.");
      return false;
    }
  }

  async function removeRecentPhoto(photoId: string) {
    try {
      await deleteRecentPhoto(photoId);
      clearFeedback();
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "Fotoğraf bu cihazdan silinemedi.");
    }
  }

  async function uploadFiles(
    intents: UploadIntent[],
    requestIds: ReadonlySet<string>,
    signal: AbortSignal,
  ) {
    const supabase = createBrowserClient({ signal });
    if (!supabase) throw new Error("Güvenli fotoğraf deposu yapılandırılmadı.");

    await Promise.all(intents.filter((intent) => requestIds.has(intent.requestId)).map(async (intent) => {
      const file = state.photos[intent.view]?.file;
      if (!file) throw new Error(`${intent.view === "front" ? "Ön" : "Arka"} fotoğraf bulunamadı.`);
      const { error } = await supabase.storage
        .from("user-photos")
        .uploadToSignedUrl(intent.path, intent.token, file, {
          contentType: intent.contentType,
          cacheControl: "3600",
        });
      // Retry sırasında append-only kaynak zaten mevcutsa Storage 409 döndürür.
      // Bu durumda dosyayı değiştirmeden mevcut, sunucuda yeniden doğrulanacak girdiyi kullanırız.
      if (error && !isAppendOnlyUploadConflict(error)) {
        throw new Error("Fotoğraf güvenli depoya yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      }
    }));
  }

  async function generateVariant(productId: string, sessionId: string, epoch: number, variant: PlannedVariant) {
    const requestKey = `generate:${sessionId}:${variant.id}`;
    const controller = startRequest(requestKey);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 175_000);
    upsertVariant(sessionId, epoch, {
      ...variant,
      status: "processing",
      imageUrl: null,
      error: null,
      errorCode: null,
      retrySameRequest: true,
    });
    try {
      for (let recoveryAttempt = 0; ; recoveryAttempt += 1) {
        const response = await fetch("/api/try-ons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            productId,
            requestId: variant.id,
            size: variant.size,
            view: variant.view,
          }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as ApiPayload<TryOnResult> | null;
        if (!response.ok || !payload?.data) {
          const recoveryDelay = PROVIDER_RESULT_RECOVERY_DELAYS_MS[recoveryAttempt];
          if (
            payload?.code === "provider_result_unavailable"
            && payload.retrySameRequest === true
            && recoveryDelay !== undefined
          ) {
            await waitForAbortableDelay(recoveryDelay, controller.signal);
            continue;
          }
          const error = new Error(payload?.error || "Bu sonuç oluşturulamadı.") as Error & {
            actionHref?: string;
            retrySameRequest?: boolean;
            code?: string;
          };
          error.actionHref = payload?.actionHref;
          error.retrySameRequest = payload?.retrySameRequest ?? response.status >= 500;
          error.code = payload?.code;
          throw error;
        }
        if (!isCurrentGeneration(sessionId, epoch)) return { ok: false as const, cancelled: true as const };
        upsertVariant(sessionId, epoch, {
          id: payload.data.id,
          size: payload.data.size,
          view: payload.data.view,
          status: "ready",
          imageUrl: payload.data.imageUrl,
          error: null,
          errorCode: null,
          retrySameRequest: false,
          fitIntent: payload.data.fitIntent,
          fitScore: payload.data.fitScore,
          sizeRecommendation: payload.data.sizeRecommendation,
          renderMode: payload.data.renderMode,
        });
        return { ok: true as const, variant: payload.data };
      }
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (!isCurrentGeneration(sessionId, epoch) || (isAbort && !timedOut)) {
        return { ok: false as const, cancelled: true as const };
      }
      const isFetch = error instanceof TypeError && /failed to fetch/i.test(error.message);
      const text = isAbort
        ? "İşlem zaman aşımına uğradı; aynı sonucu tekrar deneyebilirsin."
        : isFetch
          ? "Sunucuya bağlanılamadı. Yerel sunucunun açık olduğunu kontrol et."
          : error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
      const retrySameRequest = isAbort || isFetch || (error as { retrySameRequest?: boolean }).retrySameRequest === true;
      upsertVariant(sessionId, epoch, {
        ...variant,
        status: "error",
        imageUrl: null,
        error: text,
        errorCode: (error as { code?: string }).code ?? (isAbort ? "client_timeout" : isFetch ? "network_error" : null),
        retrySameRequest,
      });
      return {
        ok: false as const,
        cancelled: false as const,
        error: text,
        errorCode: (error as { code?: string }).code ?? null,
        retrySameRequest,
        actionHref: (error as { actionHref?: string }).actionHref,
      };
    } finally {
      window.clearTimeout(timeout);
      finishRequest(requestKey, controller);
    }
  }

  async function generateResults(options: {
    freshRequest?: boolean;
    providerMode?: TryOnProviderMode;
  } = {}) {
    clearFeedback();
    const providerMode = options.providerMode ?? providerModeForRenderMode(state.generationMode);
    const expectedRenderMode: TryOnRenderMode = providerMode === "fit_aware"
      ? "fit-aware"
      : "garment-fidelity";
    if (!selectedProduct) {
      setTone("error");
      setMessage("Kütüphaneden bir ürün seç.");
      return;
    }
    const missingView = selectedViews.find((view) => !state.photos[view]);
    if (missingView) {
      setTone("error");
      setMessage(`${missingView === "front" ? "Ön" : "Arka"} görünüm için kendi fotoğrafını yükle.`);
      return;
    }
    if (state.selectedSizes.length === 0) {
      setTone("error");
      setMessage("En az bir beden seç.");
      return;
    }
    if (expectedRenderMode === "garment-fidelity" && state.selectedSizes.length > 1) {
      setTone("error");
      setMessage("Ürün detayı modu beden ölçüsünü görsele uygulamaz. Bir beden seç veya çoklu karşılaştırma için Beden görünümü Beta'yı aç.");
      return;
    }
    if (!unlimitedTestMode && resultCount > MAX_RESULTS_PER_BATCH) {
      setTone("error");
      setMessage(`Bu seçim ${resultCount} sonuç üretir. Tek provada en fazla ${MAX_RESULTS_PER_BATCH} sonuç seçebilirsin.`);
      return;
    }
    if (!state.consent) {
      setTone("error");
      setMessage("Fotoğraf işleme bilgilendirmesini okuyup onayla.");
      return;
    }

    const planShape = buildTryOnPlan(state.selectedSizes, selectedViews);
    const canReuse = !options.freshRequest
      && Boolean(state.sessionId)
      && variantKeysMatch(state.variants, planShape)
      && Object.values(state.variants).every(
        (variant) => !variant.renderMode || variant.renderMode === expectedRenderMode,
      );
    const sessionId = canReuse && state.sessionId ? state.sessionId : crypto.randomUUID();
    const planned: PlannedVariant[] = planShape.map(({ size, view }) => {
      const existing = canReuse ? state.variants[tryOnVariantKey(size, view)] : null;
      return existing ?? queuedVariant(crypto.randomUUID(), size, view, undefined, expectedRenderMode);
    });
    const generationPlan = prepareGenerationVariants(planned);
    const { targets, targetIds, variants: generationVariants } = generationPlan;
    const permanentFailures = planned.filter(
      (variant) => variant.status === "error" && !variant.retrySameRequest,
    );
    const uncertainFailures = permanentFailures.filter(variantRequiresProviderReview);
    if (targets.length === 0) {
      if (permanentFailures.length > 0) {
        setTone("error");
        if (uncertainFailures.length > 0) {
          setActionHref("/support");
          setMessage("Sağlayıcı işleminin durumu belirsiz. Fal işlem/kredi durumunu kontrol etmeden yeni prova başlatma.");
        } else {
          setMessage("Bu sonuç aynı istekle yeniden denenemez. Fotoğraflarını yeniden seçmek için yeni bir prova başlat.");
        }
      } else {
        setTone("success");
        setMessage(`${planned.length} prova sonucu zaten hazır.`);
      }
      return;
    }

    const epoch = beginGeneration(sessionId, generationVariants);
    setTone("loading");
    setMessage(expectedRenderMode === "garment-fidelity"
      ? `${targets.length} ürün görünümü ayrıntı öncelikli hazırlanıyor…`
      : `${targets.length} deneysel beden görünümü hazırlanıyor…`);

    const uploadKey = `upload:${sessionId}`;
    const uploadController = startRequest(uploadKey);
    let uploadTimedOut = false;
    let uploadTimeout = window.setTimeout(() => {
      uploadTimedOut = true;
      uploadController.abort();
    }, 20_000);
    let uploadRetrySameRequest = true;
    let uploadErrorCode: string | null = null;
    try {
      const intentResponse = await fetch("/api/try-ons/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          productId: selectedProduct.id,
          providerMode,
          variants: planned.map((variant) => {
            const file = state.photos[variant.view]?.file;
            return {
              requestId: variant.id,
              size: variant.size,
              view: variant.view,
              file: {
                kind: "person",
                contentType: file?.type,
                size: file?.size,
              },
            };
          }),
        }),
        signal: uploadController.signal,
      });
      const intentPayload = await intentResponse.json().catch(() => null) as UploadIntentPayload | null;
      if (!intentResponse.ok || !intentPayload?.data) {
        uploadRetrySameRequest = intentPayload?.retrySameRequest === true;
        uploadErrorCode = intentPayload?.code ?? null;
        if (isCurrentGeneration(sessionId, epoch)) setActionHref(intentPayload?.actionHref ?? "");
        throw new Error(intentPayload?.error || "Güvenli yükleme başlatılamadı.");
      }
      window.clearTimeout(uploadTimeout);
      uploadTimeout = window.setTimeout(() => {
        uploadTimedOut = true;
        uploadController.abort();
      }, 45_000);
      await uploadFiles(intentPayload.data.intents, targetIds, uploadController.signal);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (!isCurrentGeneration(sessionId, epoch) || (isAbort && !uploadTimedOut)) return;
      const isFetch = error instanceof TypeError && /failed to fetch/i.test(error.message);
      const retrySameRequest = isAbort || isFetch || uploadRetrySameRequest;
      setTone("error");
      setMessage(isAbort
        ? "Fotoğraf yükleme zaman aşımına uğradı. Aynı seçimlerle tekrar dene."
        : isFetch
          ? "Sunucuya bağlanılamadı. Yerel sunucunun açık olduğunu kontrol et."
          : error instanceof Error ? error.message : "Fotoğraflar yüklenemedi.");
      replaceVariants(sessionId, epoch, generationVariants.map((variant) => targetIds.has(variant.id)
        ? {
            ...variant,
            status: "error",
            imageUrl: null,
            error: "Yükleme tamamlanamadı.",
            errorCode: uploadErrorCode,
            retrySameRequest,
          }
        : variant));
      return;
    } finally {
      window.clearTimeout(uploadTimeout);
      finishRequest(uploadKey, uploadController);
    }

    const outcomes = await Promise.all(targets.map(
      (variant) => generateVariant(selectedProduct.id, sessionId, epoch, variant),
    ));
    if (!isCurrentGeneration(sessionId, epoch)) return;
    const completed = planned.filter((variant) => variant.status === "ready" && variant.imageUrl).length
      + outcomes.filter((outcome) => outcome.ok).length;
    const failedOutcomes = outcomes.filter(
      (outcome): outcome is Extract<typeof outcome, { cancelled: false }> => !outcome.ok && outcome.cancelled === false,
    );
    const firstAction = failedOutcomes.find((outcome) => outcome.actionHref)?.actionHref;
    if (firstAction) setActionHref(firstAction);
    const hasPermanentFailure = permanentFailures.length > 0
      || failedOutcomes.some((outcome) => !outcome.retrySameRequest);
    const hasUncertainFailure = uncertainFailures.length > 0
      || failedOutcomes.some((outcome) => outcome.errorCode === "provider_submit_uncertain");
    if (hasUncertainFailure) setActionHref("/support");
    if (completed === planned.length) {
      setTone("success");
      setMessage(expectedRenderMode === "garment-fidelity"
        ? `${completed} ayrıntı öncelikli prova sonucu hazır.`
        : `${completed} prova sonucu hazır. Bedenler arasında geçiş yapabilirsin.`);
    } else if (completed > 0) {
      setTone("error");
      setMessage(hasUncertainFailure
        ? `${completed}/${planned.length} sonuç hazır. Belirsiz sağlayıcı işlemi için kredi durumunu kontrol etmeden yeni prova başlatma.`
        : hasPermanentFailure
          ? `${completed}/${planned.length} sonuç hazır. Tamamlanamayan sonuç için yeni bir prova başlat.`
        : `${completed}/${planned.length} sonuç hazır. Hatalı sonuçları aynı seçimlerle tekrar deneyebilirsin.`);
    } else {
      setTone("error");
      setMessage(hasUncertainFailure
        ? failedOutcomes[0]?.error ?? "Sağlayıcı işleminin durumu belirsiz. Kredi durumunu kontrol etmeden yeni prova başlatma."
        : hasPermanentFailure
          ? failedOutcomes[0]?.error ?? "Bu sonuç aynı istekle yeniden denenemez. Yeni bir prova başlat."
        : failedOutcomes[0]?.error ?? "Prova sonuçları oluşturulamadı.");
    }
  }

  async function openSaveDialog() {
    if (!activeVariant || !state.sessionId || !selectedProduct) return;
    setSaveTitle(`${selectedProduct.title} · ${state.selectedSizes.join("/")}`.slice(0, 100));
    setGroupChoice("");
    setNewGroupName("");
    setSaveError("");
    setSaveOpen(true);
    try {
      const response = await fetch("/api/look-groups", { cache: "no-store" });
      const payload = await response.json() as ApiPayload<LookGroup[]>;
      if (!response.ok) throw new Error(payload.error || "Gruplar yüklenemedi.");
      setGroups(payload.data ?? []);
    } catch (error) {
      setGroups([]);
      setSaveError(error instanceof Error ? error.message : "Gruplar yüklenemedi.");
    }
  }

  async function saveLook() {
    if (!activeVariant || !state.sessionId || !saveTitle.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      let groupId: string | null = groupChoice || null;
      if (groupChoice === "new") {
        if (!newGroupName.trim()) throw new Error("Yeni grup için bir ad yaz.");
        const groupResponse = await fetch("/api/look-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newGroupName }),
        });
        const groupPayload = await groupResponse.json() as ApiPayload<LookGroup>;
        if (!groupResponse.ok || !groupPayload.data) throw new Error(groupPayload.error || "Grup oluşturulamadı.");
        groupId = groupPayload.data.id;
        setGroups((current) => current.some((group) => group.id === groupPayload.data!.id)
          ? current
          : [groupPayload.data!, ...current]);
        setGroupChoice(groupPayload.data.id);
        setNewGroupName("");
      }
      const response = await fetch("/api/looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          title: saveTitle,
          groupId,
          coverTryOnId: activeVariant.id,
        }),
      });
      const payload = await response.json() as ApiPayload<{ id: string }>;
      if (!response.ok) throw new Error(payload.error || "Kombin kaydedilemedi.");
      setSaveOpen(false);
      setTone("success");
      setMessage("Kombin adı, beden sonuçları ve grubu ile kaydedildi.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kombin kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const activeAssessment = activeVariant ? assessments.get(activeVariant.size) : null;
  const activeProductReference = activeVariant && selectedProduct
    ? selectedProduct.images.find(
        (image) => image.view === (activeVariant.view === "front" ? "Ön" : "Arka"),
      ) ?? null
    : null;

  if (!state.hydrated) {
    return (
      <section className="workspace-page try-on-workspace" aria-busy="true">
        <SectionHeading
          eyebrow="SANAL PROVA"
          title="Yeni prova"
          description="Kaydedilmiş prova seçimlerin güvenli biçimde geri yükleniyor."
        />
        <div className="preview-empty-professional try-on-hydration" role="status">
          <span className="loading-spinner" />
          <strong>Provan geri yükleniyor</strong>
          <p>Fotoğraf, ürün ve sonuç seçimlerin korunuyor.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-page try-on-workspace">
      <SectionHeading
        eyebrow="SANAL PROVA"
        title="Yeni prova"
        description="Kıyafeti fotoğrafında gör; beden önerisini ölçü rehberiyle ayrı değerlendir."
      />

      <div className="try-on-layout">
        <div className="try-on-flow">
          <section className="try-on-builder" aria-label="Prova ayarları">
            <div className="builder-section">
              <div className="builder-heading"><span>1</span><div><h2>Kıyafet</h2><p>Kütüphaneden bir ürün seç.</p></div></div>
              <CatalogBrowser
                products={PRODUCT_CATALOG}
                selectedProductId={state.productId}
                disabled={isBusy}
                onChooseProduct={chooseProduct}
              />
              {selectedProduct ? (
                <div className="product-disclosure">
                  <button type="button" onClick={() => setProductExpanded((open) => !open)} aria-expanded={productExpanded}>
                    <span>Ürün bilgisi ve beden tablosu</span><b aria-hidden>{productExpanded ? "−" : "+"}</b>
                  </button>
                  {productExpanded ? (
                    <div className="product-disclosure-panel">
                      <div className="product-mini-gallery">
                        {selectedProduct.images.map((image) => (
                          <button
                            type="button"
                            key={image.view}
                            data-product-image-trigger={image.view}
                            onClick={() => { lightboxReturnView.current = image.view; setLightboxImage(image); }}
                            aria-label={`${image.view} ürün görselini büyüt`}
                          >
                            <span><Image src={image.src} alt={image.alt} fill sizes="240px" /></span>
                            <strong>{image.view} · Büyüt</strong>
                          </button>
                        ))}
                      </div>
                      <p>{selectedProduct.description}</p>
                      <dl>
                        <div><dt>Kesim</dt><dd>{selectedProduct.fit}</dd></div>
                        <div><dt>Materyal</dt><dd>{selectedProduct.material}</dd></div>
                        <div><dt>Renk</dt><dd>{selectedProduct.color}</dd></div>
                        <div><dt>Fiyat</dt><dd>{selectedProduct.price}</dd></div>
                        <div><dt>Referans</dt><dd>{selectedProduct.reference}</dd></div>
                        <div><dt>Kategori</dt><dd>{selectedProduct.audience} · {selectedProduct.productType}</dd></div>
                      </dl>
                      <div className="catalog-size-table-wrap">
                        <table><thead><tr><th>Beden</th>{selectedProduct.categoryKey === "bottoms" ? null : <th>Göğüs</th>}<th>Bel</th><th>Basen</th></tr></thead><tbody>
                          {selectedProduct.sizeGuide.map((row) => <tr key={row.size}><th>{row.size}</th>{selectedProduct.categoryKey === "bottoms" ? null : <td>{row.chestCm} cm</td>}<td>{row.waistCm} cm</td><td>{row.hipCm} cm</td></tr>)}
                        </tbody></table>
                      </div>
                      <p className="muted-note">{selectedProduct.sizeGuideNote}</p>
                      <div className="product-care-summary">
                        <strong>Bakım</strong>
                        <ul>{selectedProduct.care.map((instruction) => <li key={instruction}>{instruction}</li>)}</ul>
                      </div>
                      <p className="muted-note">{selectedProduct.availability} · Kaynak kontrolü: {selectedProduct.sourceCheckedAt}</p>
                      <p className="product-data-quality"><strong>Referans kalitesi</strong> {selectedProduct.renderingProfile.referenceNote} Bu nedenle beden görünümü yapay zekâ tahminidir.</p>
                      <a href={selectedProduct.sourceUrl} target="_blank" rel="noopener noreferrer">Mağazada aç ↗</a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="builder-section">
              <div className="builder-heading"><span>2</span><div><h2>Görsel ve beden</h2><p>Önce kalite önceliğini, sonra bedeni seç.</p></div></div>
              <div className="generation-mode-picker">
                <span>Görsel önceliği</span>
                <div role="radiogroup" aria-label="Prova görseli önceliği">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={state.generationMode === "garment-fidelity"}
                    className={state.generationMode === "garment-fidelity" ? "is-selected" : ""}
                    onClick={() => chooseGenerationMode("garment-fidelity")}
                    disabled={isBusy}
                  >
                    <strong>Ürün detayı</strong>
                    <small>Önerilen · baskı ve doku öncelikli</small>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={state.generationMode === "fit-aware"}
                    className={state.generationMode === "fit-aware" ? "is-selected" : ""}
                    onClick={() => chooseGenerationMode("fit-aware")}
                    disabled={isBusy}
                  >
                    <strong>Beden görünümü <em>Beta</em></strong>
                    <small>Çoklu beden · ayrıntı değişebilir</small>
                  </button>
                </div>
              </div>
              {recommendation ? (
                <div className="fit-recommendation">
                  <div><small>ÖLÇÜ REHBERİNE GÖRE</small><strong>{recommendation.recommendedSize ?? "Ölçü gerekli"}</strong></div>
                  <p>{recommendation.reason}</p>
                  <div className="fit-suggestions">
                    {recommendation.closeFitSize ? <button type="button" onClick={() => chooseSizes([recommendation.closeFitSize!])} disabled={isBusy}>Dar · {recommendation.closeFitSize}</button> : null}
                    {recommendation.recommendedSize ? <button className="is-primary" type="button" onClick={() => chooseSizes([recommendation.recommendedSize!])} disabled={isBusy}>Dengeli · {recommendation.recommendedSize}</button> : null}
                    {recommendation.relaxedSize ? <button type="button" onClick={() => chooseSizes([recommendation.relaxedSize!])} disabled={isBusy}>Rahat · {recommendation.relaxedSize}</button> : null}
                  </div>
                </div>
              ) : null}
              <div className="size-choice-row" role="group" aria-label={state.generationMode === "garment-fidelity" ? "Etiketlenecek beden" : "Denenecek bedenler"}>
                {selectedProduct?.availableSizes.map((size) => {
                  const selected = state.selectedSizes.includes(size);
                  const assessment = assessments.get(size);
                  return <button className={selected ? "is-selected" : ""} type="button" key={size} aria-pressed={selected} onClick={() => chooseSize(size)} disabled={isBusy}><strong>{size}</strong><small>{assessment?.label ?? "Seç"}</small></button>;
                })}
              </div>
              {selectedProduct ? (
                <div className="size-tools">
                  {state.generationMode === "fit-aware" ? <button type="button" onClick={() => chooseSizes(selectedProduct.availableSizes)} disabled={isBusy}>Tüm bedenler</button> : null}
                  {state.selectedSizes.length ? <button type="button" onClick={() => chooseSizes([])} disabled={isBusy}>Temizle</button> : null}
                  <span>{state.generationMode === "garment-fidelity" ? "Tek ürün görünümü" : `${state.selectedSizes.length} seçili`}</span>
                </div>
              ) : null}
            </div>

            <div className="builder-section">
              <div className="builder-heading"><span>3</span><div><h2>Görünüm</h2><p>Ön, arka veya ikisini birlikte üret.</p></div></div>
              <div className="view-choice-row" role="group" aria-label="Üretilecek görünümler">
                {(["front", "back"] as const).map((view) => {
                  const selected = selectedViews.includes(view);
                  return (
                    <button className={selected ? "is-selected" : ""} type="button" key={view} aria-pressed={selected} onClick={() => chooseView(view)} disabled={isBusy}>
                      <span aria-hidden>{view === "front" ? "ÖN" : "ARKA"}</span>
                      <div><strong>{view === "front" ? "Önden üret" : "Arkadan üret"}</strong><small>{selected ? "Seçildi" : "Seç"}</small></div>
                      <b aria-hidden>{selected ? "✓" : "+"}</b>
                    </button>
                  );
                })}
              </div>
              <div className="photo-upload-grid">
                {selectedViews.map((view) => {
                  const photo = state.photos[view];
                  return (
                    <div className={`photo-upload-card ${photo ? "has-photo" : ""}`} key={view}>
                      {photo ? <span className="photo-upload-preview"><Image src={photo.previewUrl} alt={`${view === "front" ? "Ön" : "Arka"} fotoğraf önizlemesi`} fill unoptimized /></span> : <span className="photo-placeholder" aria-hidden>{view === "front" ? "ÖN" : "ARKA"}</span>}
                      <div><strong>{view === "front" ? "Ön fotoğraf" : "Arka fotoğraf"}</strong><small>Gerekli</small></div>
                      <button className="photo-source-open" type="button" onClick={() => setPhotoPickerView(view)} disabled={isBusy || inspectingPhoto === view}>{inspectingPhoto === view ? "Kontrol ediliyor…" : photo ? "Değiştir" : "Fotoğraf seç"}</button>
                      {photo ? <button type="button" onClick={() => { void setPhoto(view, null); clearFeedback(); }} disabled={isBusy}>Kaldır</button> : null}
                    </div>
                  );
                })}
              </div>
              <p className="muted-note">Her görünüm için o yönden çekilmiş gerçek fotoğraf gerekir · JPG, PNG veya WebP · en fazla 6 MB.</p>
            </div>
          </section>

          <section className="generation-panel" aria-label="Prova oluştur">
            <div className="generation-summary"><span>{state.generationMode === "garment-fidelity" ? `1 ürün × ${selectedViews.length} görünüm` : `${state.selectedSizes.length} beden × ${selectedViews.length} görünüm`}</span><strong>{resultCount} çıktı{unlimitedTestMode ? " · test kotası kapalı" : ""}</strong></div>
            <label className="compact-consent">
              <input type="checkbox" checked={state.consent} onChange={(event) => setConsent(event.target.checked)} disabled={isBusy} />
              <span>Fotoğraflarımın yalnız bu prova için geçici işleneceğini kabul ediyorum. <Link href="/legal/privacy">Gizlilik</Link></span>
            </label>
            {!unlimitedTestMode && resultCount > MAX_RESULTS_PER_BATCH ? <p className="selection-warning">Bir provada en fazla {MAX_RESULTS_PER_BATCH} çıktı oluşturabilirsin. Beden veya görünüm sayısını azalt.</p> : null}
            {message ? <p className={`form-message is-${tone}`} role={tone === "error" ? "alert" : "status"}>{message}{actionHref ? <> <Link href={actionHref}> Ayrıntılar →</Link></> : null}</p> : null}
            <button
              className="button button-primary generate-button"
              type="button"
              onClick={() => void generateResults(canRetryWithFashn
                ? { freshRequest: true, providerMode: "garment_fidelity" }
                : {})}
              disabled={isBusy || resultCount === 0 || (!unlimitedTestMode && resultCount > MAX_RESULTS_PER_BATCH)}
            >
              {isBusy
                ? "Hazırlanıyor…"
                : canRetryWithFashn
                  ? `Ürün detayıyla yeniden oluştur · ${resultCount} yeni çıktı`
                  : hasRetryableFailure
                    ? "Hatalı çıktıları yeniden dene"
                    : state.generationMode === "garment-fidelity"
                      ? `Detaylı provayı oluştur · ${resultCount} çıktı`
                      : `Beta beden görünümünü oluştur · ${resultCount} çıktı`}
            </button>
            <p className="generation-note">{state.generationMode === "garment-fidelity"
              ? "Ürün referansı kalite modunda aktarılır; seçilen beden görselde fiziksel olarak simüle edilmez."
              : "Profil ölçülerinden çıkarılan dar / dengeli / rahat etiketi metin talimatıdır; ürün ayrıntısı değişebilir."} <Link href="/states/photo-quality">Fotoğraf rehberi</Link></p>
          </section>
        </div>

        <aside className="professional-preview" aria-live="polite" aria-busy={isBusy}>
          <div className="preview-topline">
            <h2>Sonuçlar</h2>
            <div>
              <span>{readyVariants.length}/{variants.length || resultCount} hazır</span>
              <button type="button" onClick={() => void refreshSessionResults()} disabled={!state.sessionId || isBusy || restoringResults} aria-label="Prova sonuçlarını yenile">
                <span aria-hidden>↻</span>{restoringResults ? "Yükleniyor" : "Yenile"}
              </button>
            </div>
          </div>

          {variants.length > 0 ? (
            <div className="result-size-tabs" role="group" aria-label="Beden sonuçları">
              {state.selectedSizes.map((size) => {
                const sizeVariants = variants.filter((variant) => variant.size === size);
                const ready = sizeVariants.filter((variant) => variant.status === "ready" && variant.imageUrl).length;
                const hasError = sizeVariants.some((variant) => variant.status === "error");
                return <button className={state.activeSize === size ? "is-active" : ""} type="button" aria-pressed={state.activeSize === size} key={size} onClick={() => setActiveSize(size)}><strong>{size}</strong><small>{hasError ? "Hata" : `${ready}/${selectedViews.length}`}</small></button>;
              })}
            </div>
          ) : null}

          {resultViews.length > 1 ? (
            <div className="view-switcher" role="group" aria-label="Fotoğraf görünümü">
              {resultViews.map((view) => <button className={state.activeView === view ? "is-active" : ""} type="button" aria-pressed={state.activeView === view} key={view} onClick={() => setActiveView(view)}>{view === "front" ? "Ön" : "Arka"}</button>)}
            </div>
          ) : null}

          {activeVariant?.imageUrl ? (
            <>
              <div className="preview-mode-switcher">
                <button className={state.compare.mode === "before-after" ? "is-active" : ""} type="button" onClick={() => setCompare({ mode: "before-after" })}>Önce / sonra</button>
                <button className={state.compare.mode === "sizes" ? "is-active" : ""} type="button" onClick={() => setCompare({ mode: "sizes" })} disabled={readySizesForView.length < 2 || activeVariant.renderMode === "garment-fidelity"}>Beta beden karşılaştır</button>
              </div>
              {state.compare.mode === "sizes" && compareLeft?.imageUrl && compareRight?.imageUrl ? (
                <>
                  <div className="compare-selectors">
                    <label>Sol<select value={state.compare.leftSize} onChange={(event) => setCompare({ leftSize: event.target.value })}>{readySizesForView.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
                    <label>Sağ<select value={state.compare.rightSize} onChange={(event) => setCompare({ rightSize: event.target.value })}>{readySizesForView.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
                  </div>
                  <BeforeAfterSlider
                    beforeUrl={compareLeft.imageUrl}
                    afterUrl={compareRight.imageUrl}
                    beforeLabel={`${compareLeft.size} beden`}
                    afterLabel={`${compareRight.size} beden`}
                    splitPercent={state.compare.splitPercent}
                    onSplitChange={(splitPercent) => setCompare({ splitPercent })}
                    onBeforeInvalid={() => invalidateBlackResult(compareLeft)}
                    onAfterInvalid={() => invalidateBlackResult(compareRight)}
                  />
                </>
              ) : activePhoto ? (
                <BeforeAfterSlider
                  beforeUrl={activePhoto.previewUrl}
                  afterUrl={activeVariant.imageUrl}
                  beforeLabel="Önce"
                  afterLabel={`${activeVariant.size} · ${activeVariant.view === "front" ? "Ön" : "Arka"}`}
                  splitPercent={state.compare.splitPercent}
                  onSplitChange={(splitPercent) => setCompare({ splitPercent })}
                  onAfterInvalid={() => invalidateBlackResult(activeVariant)}
                />
              ) : (
                <div className="result-only-image"><Image src={activeVariant.imageUrl} alt={`${activeVariant.size} beden prova sonucu`} fill unoptimized /></div>
              )}
              <div className="active-result-meta"><div><small>{activeVariant.renderMode === "garment-fidelity" ? "ÜRÜN DETAYI YÜKSEK" : "DENEYSEL KALIP GÖRSELİ"} · {activeVariant.view === "front" ? "ÖN" : "ARKA"}</small><h3>{activeVariant.renderMode === "garment-fidelity" ? "Ürün görünümü" : `${activeVariant.size} beden`}</h3><p>{activeVariant.renderMode === "garment-fidelity" ? `${activeVariant.size} seçimi · beden önerisi ayrı hesaplanır` : activeVariant.sizeRecommendation === activeVariant.size ? "Ölçülere göre önerilen" : activeAssessment?.label ?? "Görsel prova sonucu"}</p></div><span>{activeVariant.fitScore !== null ? `Beden tablosu ${activeVariant.fitScore}/100` : "Yaklaşık"}</span></div>
              <div className="fit-accuracy-note">
                <strong>{activeVariant.renderMode === "garment-fidelity" ? "Ürün aktarımı" : "Deneysel kalıp görünümü"}</strong>
                <p>{activeVariant.renderMode === "garment-fidelity"
                  ? "Baskı, renk ve kumaş görünümü öncelikli kalite ayarlarıyla işlendi; beden adı yalnız analitik öneri içindir."
                  : "Profil ölçülerinden çıkarılan dar, dengeli veya rahat etiketi modele metin talimatı olarak verildi; ürün deseni ve dokusu değişebilir."}</p>
                <small>Ürünün beden bazlı fiziksel ölçüleri olmadığı için gerçek kumaş bolluğu ve uzunluğu garanti edilemez.</small>
              </div>
              {activeProductReference ? (
                <button
                  className="result-product-reference"
                  type="button"
                  onClick={() => {
                    lightboxReturnView.current = activeProductReference.view;
                    setLightboxImage(activeProductReference);
                  }}
                >
                  <span><Image src={activeProductReference.src} alt="" fill sizes="72px" /></span>
                  <div><strong>Orijinal ürün referansı</strong><small>Baskı ve dokuyu büyüterek karşılaştır</small></div>
                  <b aria-hidden>↗</b>
                </button>
              ) : null}
              <div className="preview-actions">
                <button className="button button-primary" type="button" onClick={openSaveDialog} disabled={isBusy}>Kombini kaydet</button>
                <a className="button button-secondary" href={selectedProduct?.sourceUrl} target="_blank" rel="noopener noreferrer">Mağazada aç</a>
                <button className="button button-quiet" type="button" onClick={startNewTryOn}>Baştan başla</button>
              </div>
            </>
          ) : (
            <div className="preview-empty-professional">
              {isBusy ? <><span className="loading-spinner" /><strong>Provan hazırlanıyor</strong><p>{state.generationMode === "garment-fidelity" ? "Ürün baskısı, rengi ve dokusu kalite öncelikli aktarılıyor." : "Seçilen beden yönü deneysel kalıp görseline uygulanıyor."}</p></> : <><span aria-hidden>↔</span><strong>Sonucun burada görünecek</strong><p>Kıyafet, beden ve fotoğrafını seçerek provayı başlat.</p></>}
            </div>
          )}

          {variants.some((variant) => variant.status === "error") ? (
            <div className="variant-error-list">
              <strong>Tamamlanamayanlar</strong>
              {variants.filter((variant) => variant.status === "error").map((variant) => (
                <p key={variant.id}>
                  <span>{variant.size} · {variant.view === "front" ? "Ön" : "Arka"}</span>
                  {variant.error || statusLabel(variant.status)}
                </p>
              ))}
              {variants.some((variant) => variant.status === "error" && !variant.retrySameRequest && !variantRequiresProviderReview(variant) && !variantCanUseGarmentFidelityFallback(variant))
                ? <button className="text-button" type="button" onClick={startNewTryOn}>Yeni prova başlat</button>
                : null}
              {variants.some((variant) => variant.status === "error" && variantRequiresProviderReview(variant))
                ? <Link className="text-button" href="/support">Destek ve işlem kontrolü</Link>
                : null}
            </div>
          ) : null}
          {variants.some((variant) => variant.status === "resume") ? <div className="variant-error-list"><strong>Sonuçlar geri yükleniyor</strong><p>Kayıtlı sonuç bağlantıları güvenli biçimde yenileniyor. Tamamlanmamış bir sonuç varsa aynı seçimlerle devam edebilirsin.</p></div> : null}
        </aside>
      </div>

      {saveOpen && activeVariant ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSaveOpen(false); }}>
          <section className="save-look-dialog" role="dialog" aria-modal="true" aria-labelledby="save-look-title">
            <div className="dialog-heading"><div><small>KOMBİNİ KAYDET</small><h2 id="save-look-title">Sonuçlarını düzenle</h2></div><button type="button" aria-label="Pencereyi kapat" onClick={() => setSaveOpen(false)} disabled={saving}>×</button></div>
            <div className="save-cover-summary"><span className="save-cover-image"><Image src={activeVariant.imageUrl!} alt="Seçilen kombin kapağı" fill unoptimized /></span><div><strong>{activeVariant.size} · {activeVariant.view === "front" ? "Ön" : "Arka"}</strong><small>Kapak görseli</small></div></div>
            <label className="dialog-field">Kombin adı<input value={saveTitle} maxLength={100} onChange={(event) => setSaveTitle(event.target.value)} autoFocus /></label>
            <label className="dialog-field">Grup<select value={groupChoice} onChange={(event) => setGroupChoice(event.target.value)}><option value="">Grupsuz</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} ({group.lookCount})</option>)}<option value="new">+ Yeni grup oluştur</option></select></label>
            {groupChoice === "new" ? <label className="dialog-field">Yeni grup adı<input value={newGroupName} maxLength={60} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Örn. Yaz kombinleri" /></label> : null}
            {saveError ? <p className="form-message is-error" role="alert">{saveError}</p> : null}
            <p className="dialog-note">Seçtiğin görsel prova ve ölçü rehberi sonuçları tek kombin altında saklanır.</p>
            <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setSaveOpen(false)} disabled={saving}>Vazgeç</button><button className="button button-primary" type="button" onClick={saveLook} disabled={saving || !saveTitle.trim()}>{saving ? "Kaydediliyor…" : "Kombini kaydet"}</button></div>
          </section>
        </div>
      ) : null}
      {photoPickerView ? (
        <PhotoSourcePicker
          view={photoPickerView}
          recentPhotos={recentPhotos}
          photoLibraryReady={photoLibraryReady}
          busy={isBusy || inspectingPhoto === photoPickerView}
          onClose={closePhotoPicker}
          onChooseFile={(file) => choosePhotoFile(photoPickerView, file)}
          onChooseRecent={(photoId) => chooseRecentPhoto(photoPickerView, photoId)}
          onDeleteRecent={removeRecentPhoto}
        />
      ) : null}
      <ProductImageLightbox image={lightboxImage} onClose={closeProductImage} />
    </section>
  );
}
