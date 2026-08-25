"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FitIntent, TryOnRenderMode } from "@/lib/types";
import {
  deleteTryOnPhoto,
  getTryOnPhoto,
  listTryOnPhotos,
  storeTryOnPhoto,
  touchTryOnPhoto,
  type TryOnPhotoLibrarySummary,
} from "@/lib/try-on-photo-library";

export const TRY_ON_DRAFT_STORAGE_VERSION = 6 as const;
const LEGACY_TRY_ON_DRAFT_STORAGE_VERSION = 2 as const;
const PREVIOUS_TRY_ON_DRAFT_STORAGE_VERSIONS = [5, 4, 3] as const;

export type TryOnView = "front" | "back";
export type TryOnCompareMode = "before-after" | "sizes";
export type TryOnVariantStatus = "queued" | "processing" | "ready" | "error" | "resume";

export type TryOnDraftPhoto = {
  file: File;
  previewUrl: string;
  libraryId: string | null;
};

export type TryOnDraftVariant = {
  id: string;
  size: string;
  view: TryOnView;
  status: TryOnVariantStatus;
  imageUrl: string | null;
  error: string | null;
  errorCode: string | null;
  retrySameRequest: boolean;
  fitIntent: FitIntent | null;
  fitScore: number | null;
  sizeRecommendation: string | null;
  renderMode?: TryOnRenderMode;
};

export type TryOnCompareState = {
  mode: TryOnCompareMode;
  leftSize: string;
  rightSize: string;
  splitPercent: number;
};

export type TryOnDraftState = {
  hydrated: boolean;
  generationEpoch: number;
  generationMode: TryOnRenderMode;
  productId: string;
  selectedSizes: string[];
  selectedViews: TryOnView[];
  photos: Record<TryOnView, TryOnDraftPhoto | null>;
  consent: boolean;
  sessionId: string | null;
  variants: Record<string, TryOnDraftVariant>;
  activeSize: string;
  activeView: TryOnView;
  compare: TryOnCompareState;
};

export type PersistedVariant = Omit<TryOnDraftVariant, "imageUrl" | "error"> & {
  imageUrl: string | null;
  error: string | null;
};

export type PersistedDraft = {
  version: typeof TRY_ON_DRAFT_STORAGE_VERSION;
  generationMode: TryOnRenderMode;
  productId: string;
  selectedSizes: string[];
  selectedViews: TryOnView[];
  photoIds: Record<TryOnView, string | null>;
  consent: boolean;
  sessionId: string | null;
  variants: PersistedVariant[];
  activeSize: string;
  activeView: TryOnView;
  compare: TryOnCompareState;
};

export type TryOnDraftAction =
  | {
    type: "hydrate";
    payload: PersistedDraft | null;
    photos?: Record<TryOnView, TryOnDraftPhoto | null>;
  }
  | { type: "set-generation-mode"; mode: TryOnRenderMode; selectedSize?: string }
  | { type: "set-product"; productId: string }
  | { type: "set-sizes"; sizes: string[] }
  | { type: "set-views"; views: TryOnView[] }
  | { type: "toggle-view"; view: TryOnView }
  | { type: "set-photo"; view: TryOnView; photo: TryOnDraftPhoto | null }
  | { type: "set-consent"; consent: boolean }
  | { type: "begin-generation"; sessionId: string; epoch: number; variants: TryOnDraftVariant[] }
  | { type: "replace-variants"; sessionId: string; epoch: number; variants: TryOnDraftVariant[] }
  | { type: "upsert-variant"; sessionId: string; epoch: number; variant: TryOnDraftVariant }
  | { type: "remove-variant"; key: string }
  | { type: "set-active-size"; size: string }
  | { type: "set-active-view"; view: TryOnView }
  | { type: "set-compare"; compare: Partial<TryOnCompareState> }
  | { type: "reset" };

export type TryOnDraftContextValue = {
  userId: string;
  state: TryOnDraftState;
  recentPhotos: TryOnPhotoLibrarySummary[];
  photoLibraryReady: boolean;
  readyVariants: TryOnDraftVariant[];
  isBusy: boolean;
  setGenerationMode: (mode: TryOnRenderMode, selectedSize?: string) => void;
  setProductId: (productId: string) => void;
  setSelectedSizes: (sizes: string[]) => void;
  toggleSize: (size: string) => void;
  setSelectedViews: (views: TryOnView[]) => void;
  toggleView: (view: TryOnView) => void;
  setPhoto: (view: TryOnView, file: File | null) => Promise<void>;
  selectRecentPhoto: (view: TryOnView, photoId: string) => Promise<boolean>;
  deleteRecentPhoto: (photoId: string) => Promise<void>;
  refreshRecentPhotos: () => Promise<void>;
  setConsent: (consent: boolean) => void;
  beginGeneration: (sessionId: string, variants: TryOnDraftVariant[]) => number;
  replaceVariants: (sessionId: string, epoch: number, variants: TryOnDraftVariant[]) => void;
  upsertVariant: (sessionId: string, epoch: number, variant: TryOnDraftVariant) => void;
  isCurrentGeneration: (sessionId: string, epoch: number) => boolean;
  removeVariant: (size: string, view: TryOnView) => void;
  setActiveSize: (size: string) => void;
  setActiveView: (view: TryOnView) => void;
  setCompare: (compare: Partial<TryOnCompareState>) => void;
  resetDraft: () => void;
  startRequest: (key: string) => AbortController;
  finishRequest: (key: string, controller?: AbortController) => void;
  abortRequest: (key: string) => void;
  abortAllRequests: () => void;
};

const TryOnDraftContext = createContext<TryOnDraftContextValue | null>(null);
const TRY_ON_VIEW_ORDER: TryOnView[] = ["front", "back"];
const DEFAULT_TRY_ON_VIEWS: TryOnView[] = ["front"];
const TRY_ON_VIEWS = new Set<TryOnView>(TRY_ON_VIEW_ORDER);
const COMPARE_MODES = new Set<TryOnCompareMode>(["before-after", "sizes"]);
const VARIANT_STATUSES = new Set<TryOnVariantStatus>(["queued", "processing", "ready", "error", "resume"]);
const FIT_INTENTS = new Set<FitIntent>(["fitted", "regular", "relaxed"]);
const RENDER_MODES = new Set<TryOnRenderMode>(["fit-aware", "garment-fidelity"]);

export function createInitialTryOnDraftState(hydrated = false, generationEpoch = 0): TryOnDraftState {
  return {
    hydrated,
    generationEpoch,
    generationMode: "garment-fidelity",
    productId: "",
    selectedSizes: [],
    selectedViews: [...DEFAULT_TRY_ON_VIEWS],
    photos: { front: null, back: null },
    consent: false,
    sessionId: null,
    variants: {},
    activeSize: "",
    activeView: "front",
    compare: {
      mode: "before-after",
      leftSize: "",
      rightSize: "",
      splitPercent: 50,
    },
  };
}

export function tryOnVariantKey(size: string, view: TryOnView) {
  return `${size}:${view}`;
}

function uniqueSizes(sizes: string[]) {
  return [...new Set(sizes.map((size) => size.trim()).filter(Boolean))].slice(0, 12);
}

function uniqueViews(views: TryOnView[]) {
  const selected = new Set(views);
  const normalized = TRY_ON_VIEW_ORDER.filter((view) => selected.has(view));
  return normalized.length > 0 ? normalized : [...DEFAULT_TRY_ON_VIEWS];
}

function normalizeSizes(state: TryOnDraftState, sizes: string[]) {
  const nextSizes = uniqueSizes(sizes);
  const activeSize = nextSizes.includes(state.activeSize) ? state.activeSize : (nextSizes[0] ?? "");
  const leftSize = nextSizes.includes(state.compare.leftSize)
    ? state.compare.leftSize
    : (nextSizes[0] ?? "");
  const rightSize = nextSizes.includes(state.compare.rightSize)
    ? state.compare.rightSize
    : (nextSizes.find((size) => size !== leftSize) ?? leftSize);

  return {
    selectedSizes: nextSizes,
    activeSize,
    compare: { ...state.compare, leftSize, rightSize },
  };
}

function normalizeViews(state: TryOnDraftState, views: TryOnView[]) {
  const selectedViews = uniqueViews(views);
  const activeView = selectedViews.includes(state.activeView)
    ? state.activeView
    : selectedViews[0];

  return { selectedViews, activeView };
}

function variantsByKey(variants: TryOnDraftVariant[]) {
  return Object.fromEntries(
    variants.map((variant) => [tryOnVariantKey(variant.size, variant.view), variant]),
  );
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidatedState(state: TryOnDraftState) {
  return {
    sessionId: null,
    variants: {},
    generationEpoch: state.generationEpoch + 1,
  };
}

function isScopedToCurrentGeneration(
  state: TryOnDraftState,
  action: { sessionId: string; epoch: number },
) {
  return state.sessionId === action.sessionId && state.generationEpoch === action.epoch;
}

export function tryOnDraftReducer(state: TryOnDraftState, action: TryOnDraftAction): TryOnDraftState {
  switch (action.type) {
    case "hydrate": {
      if (!action.payload) return createInitialTryOnDraftState(true, state.generationEpoch + 1);
      const variants = variantsByKey(action.payload.variants.map((variant) => {
        if (variant.status === "ready" && variant.imageUrl) {
          return { ...variant, status: "ready" as const, error: null };
        }
        if (variant.status === "error") {
          return {
            ...variant,
            status: "error" as const,
            imageUrl: null,
            error: variant.error || "Bu prova sonucu tamamlanamadı.",
          };
        }
        return {
          ...variant,
          status: "resume" as const,
          imageUrl: null,
          error: "Bu prova işlemini kaldığın yerden devam ettirebilirsin.",
        };
      }));
      return {
        ...createInitialTryOnDraftState(true, state.generationEpoch + 1),
        generationMode: action.payload.generationMode,
        productId: action.payload.productId,
        selectedSizes: action.payload.selectedSizes,
        selectedViews: action.payload.selectedViews,
        photos: action.photos ?? { front: null, back: null },
        consent: action.payload.consent,
        sessionId: action.payload.sessionId,
        variants,
        activeSize: action.payload.activeSize,
        activeView: action.payload.activeView,
        compare: action.payload.compare,
      };
    }
    case "set-generation-mode": {
      const preferredSize = action.selectedSize?.trim();
      const nextSizes = action.mode === "garment-fidelity" && state.selectedSizes.length > 1
        ? [preferredSize && state.selectedSizes.includes(preferredSize)
          ? preferredSize
          : (state.activeSize || state.selectedSizes[0])]
        : state.selectedSizes;
      const normalized = normalizeSizes(state, nextSizes);
      if (
        action.mode === state.generationMode
        && sameStringArray(normalized.selectedSizes, state.selectedSizes)
      ) return state;
      return {
        ...state,
        generationMode: action.mode,
        ...normalized,
        compare: { ...normalized.compare, mode: "before-after" },
        ...invalidatedState(state),
      };
    }
    case "set-product":
      if (action.productId === state.productId) return state;
      return {
        ...state,
        productId: action.productId,
        selectedSizes: [],
        sessionId: null,
        variants: {},
        generationEpoch: state.generationEpoch + 1,
        activeSize: "",
        activeView: state.selectedViews.includes(state.activeView)
          ? state.activeView
          : (state.selectedViews[0] ?? "front"),
        compare: createInitialTryOnDraftState().compare,
      };
    case "set-sizes": {
      const normalized = normalizeSizes(state, action.sizes);
      if (sameStringArray(normalized.selectedSizes, state.selectedSizes)) return state;
      return { ...state, ...normalized, ...invalidatedState(state) };
    }
    case "set-views": {
      const normalized = normalizeViews(state, action.views);
      if (sameStringArray(normalized.selectedViews, state.selectedViews)) return state;
      return { ...state, ...normalized, ...invalidatedState(state) };
    }
    case "toggle-view": {
      const isSelected = state.selectedViews.includes(action.view);
      if (isSelected && state.selectedViews.length === 1) return state;
      const views = isSelected
        ? state.selectedViews.filter((view) => view !== action.view)
        : [...state.selectedViews, action.view];
      const normalized = normalizeViews(state, views);
      return { ...state, ...normalized, ...invalidatedState(state) };
    }
    case "set-photo":
      return {
        ...state,
        ...invalidatedState(state),
        photos: { ...state.photos, [action.view]: action.photo },
      };
    case "set-consent":
      return { ...state, consent: action.consent };
    case "begin-generation":
      return {
        ...state,
        sessionId: action.sessionId,
        generationEpoch: action.epoch,
        variants: variantsByKey(action.variants),
      };
    case "replace-variants":
      if (!isScopedToCurrentGeneration(state, action)) return state;
      return { ...state, variants: variantsByKey(action.variants) };
    case "upsert-variant": {
      if (!isScopedToCurrentGeneration(state, action)) return state;
      const key = tryOnVariantKey(action.variant.size, action.variant.view);
      return { ...state, variants: { ...state.variants, [key]: action.variant } };
    }
    case "remove-variant": {
      const variants = { ...state.variants };
      delete variants[action.key];
      return { ...state, variants };
    }
    case "set-active-size":
      return { ...state, activeSize: action.size };
    case "set-active-view":
      return { ...state, activeView: action.view };
    case "set-compare":
      return {
        ...state,
        compare: {
          ...state.compare,
          ...action.compare,
          splitPercent: Math.min(100, Math.max(0, action.compare.splitPercent ?? state.compare.splitPercent)),
        },
      };
    case "reset":
      return createInitialTryOnDraftState(true, state.generationEpoch + 1);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maximum = 120) {
  return typeof value === "string" && value.length <= maximum ? value : "";
}

function safeNullableString(value: unknown, maximum = 120) {
  if (value === null) return null;
  const candidate = safeString(value, maximum);
  return candidate || null;
}

function safeImageUrl(value: unknown) {
  const candidate = safeString(value, 8_192);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? candidate : null;
  } catch {
    return null;
  }
}

function parsePersistedVariant(value: unknown, restoreUrls: boolean): PersistedVariant | null {
  if (!isRecord(value)) return null;
  const id = safeString(value.id, 120);
  const size = safeString(value.size, 24);
  const view = value.view;
  const status = value.status;
  if (!id || !size || !TRY_ON_VIEWS.has(view as TryOnView) || !VARIANT_STATUSES.has(status as TryOnVariantStatus)) {
    return null;
  }
  const fitIntent = FIT_INTENTS.has(value.fitIntent as FitIntent) ? value.fitIntent as FitIntent : null;
  const fitScore = typeof value.fitScore === "number" && Number.isFinite(value.fitScore)
    ? Math.min(100, Math.max(0, Math.round(value.fitScore)))
    : null;
  const renderMode = RENDER_MODES.has(value.renderMode as TryOnRenderMode)
    ? value.renderMode as TryOnRenderMode
    : undefined;
  return {
    id,
    size,
    view: view as TryOnView,
    status: status as TryOnVariantStatus,
    retrySameRequest: value.retrySameRequest === true,
    errorCode: safeNullableString(value.errorCode, 100),
    fitIntent,
    fitScore,
    sizeRecommendation: safeNullableString(value.sizeRecommendation),
    renderMode,
    imageUrl: restoreUrls ? safeImageUrl(value.imageUrl) : null,
    error: safeNullableString(value.error, 500),
  };
}

export function parsePersistedDraft(value: unknown): PersistedDraft | null {
  if (
    !isRecord(value)
    || (value.version !== TRY_ON_DRAFT_STORAGE_VERSION
      && !PREVIOUS_TRY_ON_DRAFT_STORAGE_VERSIONS.includes(value.version as 5 | 4 | 3)
      && value.version !== LEGACY_TRY_ON_DRAFT_STORAGE_VERSION)
  ) return null;
  // SonuÃ§ baÄŸlantÄ±larÄ± kÄ±sa Ã¶mÃ¼rlÃ¼ imzalÄ± URL'lerdir. Tam sayfa yenilemesinde
  // bunlara gÃ¼venmek yerine session kimliÄŸiyle sunucudan taze URL alÄ±nÄ±r.
  const restoreUrls = false;
  const productId = safeString(value.productId);
  const parsedSelectedSizes = Array.isArray(value.selectedSizes)
    ? uniqueSizes(value.selectedSizes.map((size) => safeString(size, 24)).filter(Boolean))
    : [];
  const variants = Array.isArray(value.variants)
    ? value.variants
      .map((variant) => parsePersistedVariant(variant, restoreUrls))
      .filter((variant): variant is PersistedVariant => Boolean(variant))
      .slice(0, 24)
    : [];
  const generationMode = RENDER_MODES.has(value.generationMode as TryOnRenderMode)
    ? value.generationMode as TryOnRenderMode
    : variants.find((variant) => variant.renderMode)?.renderMode ?? "garment-fidelity";
  const selectedSizes = generationMode === "garment-fidelity"
    ? parsedSelectedSizes.slice(0, 1)
    : parsedSelectedSizes;
  const selectedViews = value.version === LEGACY_TRY_ON_DRAFT_STORAGE_VERSION
    ? uniqueViews(variants.some((variant) => variant.view === "back")
      ? TRY_ON_VIEW_ORDER
      : DEFAULT_TRY_ON_VIEWS)
    : uniqueViews(
      Array.isArray(value.selectedViews)
        ? value.selectedViews.filter((view): view is TryOnView => TRY_ON_VIEWS.has(view as TryOnView))
        : [],
    );
  const activeViewCandidate = TRY_ON_VIEWS.has(value.activeView as TryOnView)
    ? value.activeView as TryOnView
    : selectedViews[0];
  const activeView = selectedViews.includes(activeViewCandidate)
    ? activeViewCandidate
    : selectedViews[0];
  const compareValue = isRecord(value.compare) ? value.compare : {};
  const compareMode = COMPARE_MODES.has(compareValue.mode as TryOnCompareMode)
    ? compareValue.mode as TryOnCompareMode
    : "before-after";
  const rawSplit = typeof compareValue.splitPercent === "number" && Number.isFinite(compareValue.splitPercent)
    ? compareValue.splitPercent
    : 50;
  const activeSizeCandidate = safeString(value.activeSize, 24);
  const activeSize = selectedSizes.includes(activeSizeCandidate) ? activeSizeCandidate : (selectedSizes[0] ?? "");
  const leftCandidate = safeString(compareValue.leftSize, 24);
  const leftSize = selectedSizes.includes(leftCandidate) ? leftCandidate : (selectedSizes[0] ?? "");
  const rightCandidate = safeString(compareValue.rightSize, 24);
  const rightSize = selectedSizes.includes(rightCandidate)
    ? rightCandidate
    : (selectedSizes.find((size) => size !== leftSize) ?? leftSize);
  const restoresPhotoIds = value.version === TRY_ON_DRAFT_STORAGE_VERSION
    || value.version === 5
    || value.version === 4;
  const photoIdsValue = restoresPhotoIds && isRecord(value.photoIds) ? value.photoIds : {};
  const photoIds: Record<TryOnView, string | null> = {
    front: safeNullableString(photoIdsValue.front, 120),
    back: safeNullableString(photoIdsValue.back, 120),
  };

  return {
    version: TRY_ON_DRAFT_STORAGE_VERSION,
    generationMode,
    productId,
    selectedSizes,
    selectedViews,
    photoIds,
    consent: value.consent === true,
    sessionId: safeNullableString(value.sessionId),
    variants,
    activeSize,
    activeView,
    compare: {
      mode: compareMode,
      leftSize,
      rightSize,
      splitPercent: Math.min(100, Math.max(0, rawSplit)),
    },
  };
}

export function toPersistedTryOnDraft(state: TryOnDraftState): PersistedDraft {
  return {
    version: TRY_ON_DRAFT_STORAGE_VERSION,
    generationMode: state.generationMode,
    productId: state.productId,
    selectedSizes: state.selectedSizes,
    selectedViews: state.selectedViews,
    photoIds: {
      front: state.photos.front?.libraryId ?? null,
      back: state.photos.back?.libraryId ?? null,
    },
    consent: state.consent,
    sessionId: state.sessionId,
    variants: Object.values(state.variants).map(({
      id,
      size,
      view,
      status,
      error,
      errorCode,
      retrySameRequest,
      fitIntent,
      fitScore,
      sizeRecommendation,
      renderMode,
    }) => ({
      id,
      size,
      view,
      status,
      // URL 15 dakika civarÄ±nda sona erebilir; kalÄ±cÄ± taslakta yalnÄ±z kimlik
      // saklanÄ±r ve hydrate sonrasÄ± /api/try-ons ile yenilenir.
      imageUrl: null,
      error: status === "error" ? error : null,
      errorCode,
      retrySameRequest,
      fitIntent,
      fitScore,
      sizeRecommendation,
      renderMode,
    })),
    activeSize: state.activeSize,
    activeView: state.activeView,
    compare: state.compare,
  };
}

export function hasActiveTryOnWork(state: TryOnDraftState) {
  return Object.values(state.variants).some(
    (variant) => variant.status === "queued" || variant.status === "processing",
  );
}

function isEmptyDraft(state: TryOnDraftState) {
  return state.generationMode === "garment-fidelity"
    && !state.productId
    && state.selectedSizes.length === 0
    && sameStringArray(state.selectedViews, DEFAULT_TRY_ON_VIEWS)
    && !state.consent
    && !state.sessionId
    && !state.photos.front
    && !state.photos.back
    && Object.keys(state.variants).length === 0;
}

function revokePhoto(photo: TryOnDraftPhoto | null) {
  if (photo?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
}

export function TryOnDraftProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [state, dispatch] = useReducer(tryOnDraftReducer, undefined, () => createInitialTryOnDraftState());
  const [recentPhotos, setRecentPhotos] = useState<TryOnPhotoLibrarySummary[]>([]);
  const [photoLibraryReady, setPhotoLibraryReady] = useState(false);
  const stateRef = useRef(state);
  const recentPhotosRef = useRef<TryOnPhotoLibrarySummary[]>([]);
  const recentLoadRef = useRef(0);
  const photoOperationRef = useRef<Record<TryOnView, number>>({ front: 0, back: 0 });
  const controllersRef = useRef(new Map<string, AbortController>());
  const activeGenerationRef = useRef<{ sessionId: string; epoch: number } | null>(null);
  const storageKey = useMemo(
    () => `trai:try-on-draft:v${TRY_ON_DRAFT_STORAGE_VERSION}:${encodeURIComponent(userId)}`,
    [userId],
  );
  const previousStorageKeys = useMemo(
    () => [...PREVIOUS_TRY_ON_DRAFT_STORAGE_VERSIONS, LEGACY_TRY_ON_DRAFT_STORAGE_VERSION]
      .map((version) => `trai:try-on-draft:v${version}:${encodeURIComponent(userId)}`),
    [userId],
  );
  stateRef.current = state;

  const abortAllRequests = useCallback(() => {
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
  }, []);

  const cancelActiveGeneration = useCallback(() => {
    activeGenerationRef.current = null;
    abortAllRequests();
  }, [abortAllRequests]);

  const refreshRecentPhotos = useCallback(async () => {
    const loadId = recentLoadRef.current + 1;
    recentLoadRef.current = loadId;
    try {
      const entries = await listTryOnPhotos(userId);
      if (recentLoadRef.current !== loadId) return;
      const next = entries.map((entry) => ({
        id: entry.id,
        name: entry.file.name,
        type: entry.file.type,
        size: entry.file.size,
        createdAt: entry.createdAt,
        lastUsedAt: entry.lastUsedAt,
        previewUrl: URL.createObjectURL(entry.file),
      }));
      const previous = recentPhotosRef.current;
      recentPhotosRef.current = next;
      setRecentPhotos(next);
      for (const photo of previous) URL.revokeObjectURL(photo.previewUrl);
    } catch {
      if (recentLoadRef.current !== loadId) return;
      const previous = recentPhotosRef.current;
      recentPhotosRef.current = [];
      setRecentPhotos([]);
      for (const photo of previous) URL.revokeObjectURL(photo.previewUrl);
    } finally {
      if (recentLoadRef.current === loadId) setPhotoLibraryReady(true);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    let restored: PersistedDraft | null = null;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        restored = parsePersistedDraft(JSON.parse(stored) as unknown);
        if (!restored) window.sessionStorage.removeItem(storageKey);
      }

      for (const previousStorageKey of previousStorageKeys) {
        if (restored) break;
        const legacyStored = window.sessionStorage.getItem(previousStorageKey);
        if (legacyStored) {
          restored = parsePersistedDraft(JSON.parse(legacyStored) as unknown);
          if (restored) {
            window.sessionStorage.setItem(storageKey, JSON.stringify(restored));
          }
          window.sessionStorage.removeItem(previousStorageKey);
        }
      }
    } catch {
      try {
        window.sessionStorage.removeItem(storageKey);
        for (const previousStorageKey of previousStorageKeys) {
          window.sessionStorage.removeItem(previousStorageKey);
        }
      } catch {
        // Depolama kapalÄ±ysa bellek iÃ§indeki taslak kullanÄ±lÄ±r.
      }
    }

    void (async () => {
      const restoredPhotos: Record<TryOnView, TryOnDraftPhoto | null> = { front: null, back: null };
      if (restored) {
        await Promise.all(TRY_ON_VIEW_ORDER.map(async (view) => {
          const photoId = restored?.photoIds[view];
          if (!photoId) return;
          try {
            const entry = await getTryOnPhoto(userId, photoId);
            if (!entry || cancelled) return;
            restoredPhotos[view] = {
              file: entry.file,
              previewUrl: URL.createObjectURL(entry.file),
              libraryId: entry.id,
            };
          } catch {
            // IndexedDB kapalÄ±ysa taslaÄŸÄ±n diÄŸer alanlarÄ± yine geri yÃ¼klenir.
          }
        }));
      }
      if (cancelled) {
        revokePhoto(restoredPhotos.front);
        revokePhoto(restoredPhotos.back);
        return;
      }
      dispatch({ type: "hydrate", payload: restored, photos: restoredPhotos });
    })();
    void refreshRecentPhotos();

    return () => {
      cancelled = true;
      recentLoadRef.current += 1;
      cancelActiveGeneration();
      revokePhoto(stateRef.current.photos.front);
      revokePhoto(stateRef.current.photos.back);
      for (const photo of recentPhotosRef.current) URL.revokeObjectURL(photo.previewUrl);
      recentPhotosRef.current = [];
    };
  }, [cancelActiveGeneration, previousStorageKeys, refreshRecentPhotos, storageKey, userId]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      if (isEmptyDraft(state)) {
        window.sessionStorage.removeItem(storageKey);
      } else {
        window.sessionStorage.setItem(storageKey, JSON.stringify(toPersistedTryOnDraft(state)));
      }
    } catch {
      // sessionStorage kapalı veya doluysa bellek içindeki güvenli taslak çalışmaya devam eder.
    }
  }, [state, storageKey]);

  const setGenerationMode = useCallback((mode: TryOnRenderMode, selectedSize?: string) => {
    if (!RENDER_MODES.has(mode)) return;
    if (
      mode === stateRef.current.generationMode
      && !(mode === "garment-fidelity" && stateRef.current.selectedSizes.length > 1)
    ) return;
    cancelActiveGeneration();
    dispatch({ type: "set-generation-mode", mode, selectedSize });
  }, [cancelActiveGeneration]);

  const setProductId = useCallback((productId: string) => {
    const normalized = productId.trim();
    if (normalized === stateRef.current.productId) return;
    cancelActiveGeneration();
    dispatch({ type: "set-product", productId: normalized });
  }, [cancelActiveGeneration]);

  const setSelectedSizes = useCallback((sizes: string[]) => {
    const normalized = uniqueSizes(sizes);
    if (sameStringArray(normalized, stateRef.current.selectedSizes)) return;
    cancelActiveGeneration();
    dispatch({ type: "set-sizes", sizes: normalized });
  }, [cancelActiveGeneration]);

  const toggleSize = useCallback((size: string) => {
    const normalized = size.trim();
    if (!normalized) return;
    const current = stateRef.current.selectedSizes;
    setSelectedSizes(
      current.includes(normalized)
        ? current.filter((candidate) => candidate !== normalized)
        : [...current, normalized],
    );
  }, [setSelectedSizes]);

  const setSelectedViews = useCallback((views: TryOnView[]) => {
    const normalized = uniqueViews(views);
    if (sameStringArray(normalized, stateRef.current.selectedViews)) return;
    cancelActiveGeneration();
    dispatch({ type: "set-views", views: normalized });
  }, [cancelActiveGeneration]);

  const toggleView = useCallback((view: TryOnView) => {
    const current = stateRef.current.selectedViews;
    if (current.includes(view) && current.length === 1) return;
    cancelActiveGeneration();
    dispatch({ type: "toggle-view", view });
  }, [cancelActiveGeneration]);

  const setPhoto = useCallback(async (view: TryOnView, file: File | null) => {
    const currentPhoto = stateRef.current.photos[view];
    if ((currentPhoto?.file ?? null) === file) return;
    cancelActiveGeneration();
    const operation = photoOperationRef.current[view] + 1;
    photoOperationRef.current[view] = operation;
    if (!file) {
      revokePhoto(currentPhoto);
      dispatch({ type: "set-photo", view, photo: null });
      return;
    }

    let libraryId: string | null = null;
    try {
      const preserveIds = TRY_ON_VIEW_ORDER
        .map((candidate) => stateRef.current.photos[candidate]?.libraryId)
        .filter((id): id is string => Boolean(id));
      const entry = await storeTryOnPhoto(userId, file, { preserveIds });
      libraryId = entry.id;
    } catch {
      // IndexedDB kullanÄ±lamÄ±yorsa seÃ§im bellekte Ã§alÄ±ÅŸmaya devam eder.
    }
    if (photoOperationRef.current[view] !== operation) return;

    revokePhoto(stateRef.current.photos[view]);
    dispatch({
      type: "set-photo",
      view,
      photo: { file, previewUrl: URL.createObjectURL(file), libraryId },
    });
    if (libraryId) void refreshRecentPhotos();
  }, [cancelActiveGeneration, refreshRecentPhotos, userId]);

  const selectRecentPhoto = useCallback(async (view: TryOnView, photoId: string) => {
    const normalizedId = photoId.trim();
    if (!normalizedId) return false;
    cancelActiveGeneration();
    const operation = photoOperationRef.current[view] + 1;
    photoOperationRef.current[view] = operation;
    try {
      const entry = await touchTryOnPhoto(userId, normalizedId);
      if (!entry || photoOperationRef.current[view] !== operation) return false;
      revokePhoto(stateRef.current.photos[view]);
      dispatch({
        type: "set-photo",
        view,
        photo: {
          file: entry.file,
          previewUrl: URL.createObjectURL(entry.file),
          libraryId: entry.id,
        },
      });
      void refreshRecentPhotos();
      return true;
    } catch {
      return false;
    }
  }, [cancelActiveGeneration, refreshRecentPhotos, userId]);

  const deleteRecentPhoto = useCallback(async (photoId: string) => {
    const normalizedId = photoId.trim();
    if (!normalizedId) return;
    try {
      await deleteTryOnPhoto(userId, normalizedId);
    } catch {
      return;
    }
    for (const view of TRY_ON_VIEW_ORDER) {
      const selected = stateRef.current.photos[view];
      if (selected?.libraryId !== normalizedId) continue;
      photoOperationRef.current[view] += 1;
      cancelActiveGeneration();
      revokePhoto(selected);
      dispatch({ type: "set-photo", view, photo: null });
    }
    await refreshRecentPhotos();
  }, [cancelActiveGeneration, refreshRecentPhotos, userId]);

  const setConsent = useCallback((consent: boolean) => {
    dispatch({ type: "set-consent", consent });
  }, []);

  const beginGeneration = useCallback((sessionId: string, variants: TryOnDraftVariant[]) => {
    abortAllRequests();
    const epoch = stateRef.current.generationEpoch + 1;
    const normalizedSessionId = sessionId.trim();
    activeGenerationRef.current = { sessionId: normalizedSessionId, epoch };
    dispatch({ type: "begin-generation", sessionId: normalizedSessionId, epoch, variants });
    return epoch;
  }, [abortAllRequests]);

  const replaceVariants = useCallback((sessionId: string, epoch: number, variants: TryOnDraftVariant[]) => {
    dispatch({ type: "replace-variants", sessionId, epoch, variants });
  }, []);

  const upsertVariant = useCallback((sessionId: string, epoch: number, variant: TryOnDraftVariant) => {
    dispatch({ type: "upsert-variant", sessionId, epoch, variant });
  }, []);

  const isCurrentGeneration = useCallback((sessionId: string, epoch: number) => {
    const current = activeGenerationRef.current;
    return current?.sessionId === sessionId && current.epoch === epoch;
  }, []);

  const removeVariant = useCallback((size: string, view: TryOnView) => {
    dispatch({ type: "remove-variant", key: tryOnVariantKey(size, view) });
  }, []);

  const setActiveSize = useCallback((size: string) => {
    dispatch({ type: "set-active-size", size });
  }, []);

  const setActiveView = useCallback((view: TryOnView) => {
    dispatch({ type: "set-active-view", view });
  }, []);

  const setCompare = useCallback((compare: Partial<TryOnCompareState>) => {
    dispatch({ type: "set-compare", compare });
  }, []);

  const startRequest = useCallback((key: string) => {
    controllersRef.current.get(key)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    return controller;
  }, []);

  const finishRequest = useCallback((key: string, controller?: AbortController) => {
    if (!controller || controllersRef.current.get(key) === controller) {
      controllersRef.current.delete(key);
    }
  }, []);

  const abortRequest = useCallback((key: string) => {
    controllersRef.current.get(key)?.abort();
    controllersRef.current.delete(key);
  }, []);

  const resetDraft = useCallback(() => {
    cancelActiveGeneration();
    photoOperationRef.current.front += 1;
    photoOperationRef.current.back += 1;
    revokePhoto(stateRef.current.photos.front);
    revokePhoto(stateRef.current.photos.back);
    try {
      window.sessionStorage.removeItem(storageKey);
      for (const previousStorageKey of previousStorageKeys) {
        window.sessionStorage.removeItem(previousStorageKey);
      }
    } catch {
      // Depolama kapalı olsa da bellek taslağı temizlenir.
    }
    dispatch({ type: "reset" });
  }, [cancelActiveGeneration, previousStorageKeys, storageKey]);

  const value = useMemo<TryOnDraftContextValue>(() => ({
    userId,
    state,
    recentPhotos,
    photoLibraryReady,
    readyVariants: Object.values(state.variants).filter(
      (variant) => variant.status === "ready" && Boolean(variant.imageUrl),
    ),
    isBusy: hasActiveTryOnWork(state),
    setGenerationMode,
    setProductId,
    setSelectedSizes,
    toggleSize,
    setSelectedViews,
    toggleView,
    setPhoto,
    selectRecentPhoto,
    deleteRecentPhoto,
    refreshRecentPhotos,
    setConsent,
    beginGeneration,
    replaceVariants,
    upsertVariant,
    isCurrentGeneration,
    removeVariant,
    setActiveSize,
    setActiveView,
    setCompare,
    resetDraft,
    startRequest,
    finishRequest,
    abortRequest,
    abortAllRequests,
  }), [
    abortAllRequests,
    abortRequest,
    beginGeneration,
    deleteRecentPhoto,
    finishRequest,
    isCurrentGeneration,
    photoLibraryReady,
    recentPhotos,
    refreshRecentPhotos,
    removeVariant,
    replaceVariants,
    resetDraft,
    setActiveSize,
    setActiveView,
    setCompare,
    setConsent,
    setGenerationMode,
    setPhoto,
    setProductId,
    setSelectedSizes,
    setSelectedViews,
    startRequest,
    state,
    toggleSize,
    toggleView,
    upsertVariant,
    userId,
    selectRecentPhoto,
  ]);

  return <TryOnDraftContext.Provider value={value}>{children}</TryOnDraftContext.Provider>;
}

export function useTryOnDraft() {
  const context = useContext(TryOnDraftContext);
  if (!context) throw new Error("useTryOnDraft, TryOnDraftProvider içinde kullanılmalıdır.");
  return context;
}
