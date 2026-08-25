import { describe, expect, it } from "vitest";
import {
  TRY_ON_DRAFT_STORAGE_VERSION,
  createInitialTryOnDraftState,
  hasActiveTryOnWork,
  parsePersistedDraft,
  toPersistedTryOnDraft,
  tryOnDraftReducer,
  type PersistedDraft,
  type TryOnDraftVariant,
} from "@/components/try-on-draft-provider";

function variant(overrides: Partial<TryOnDraftVariant> = {}): TryOnDraftVariant {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    size: "M",
    view: "front",
    status: "queued",
    imageUrl: null,
    error: null,
    errorCode: null,
    retrySameRequest: true,
    fitIntent: "regular",
    fitScore: 94,
    sizeRecommendation: "M",
    ...overrides,
  };
}

describe("try-on draft reducer safety", () => {
  it("defaults to the front view", () => {
    expect(createInitialTryOnDraftState().selectedViews).toEqual(["front"]);
    expect(createInitialTryOnDraftState().generationMode).toBe("garment-fidelity");
  });

  it("invalidates generated results when the visual priority changes", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-mode",
      epoch: 1,
      variants: [variant({ renderMode: "garment-fidelity" })],
    });

    state = tryOnDraftReducer(state, { type: "set-generation-mode", mode: "fit-aware" });

    expect(state.generationMode).toBe("fit-aware");
    expect(state.sessionId).toBeNull();
    expect(state.variants).toEqual({});
    expect(state.compare.mode).toBe("before-after");
  });

  it("atomically reduces a multi-size beta selection when product-detail mode is chosen", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, { type: "set-generation-mode", mode: "fit-aware" });
    state = tryOnDraftReducer(state, { type: "set-sizes", sizes: ["S", "M", "L"] });

    state = tryOnDraftReducer(state, {
      type: "set-generation-mode",
      mode: "garment-fidelity",
      selectedSize: "M",
    });

    expect(state.generationMode).toBe("garment-fidelity");
    expect(state.selectedSizes).toEqual(["M"]);
    expect(state.activeSize).toBe("M");
    expect(state.compare).toMatchObject({ mode: "before-after", leftSize: "M", rightSize: "M" });
  });

  it("invalidates the session and ignores stale epochs after a size change", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, { type: "set-product", productId: "product-1" });
    state = tryOnDraftReducer(state, { type: "set-sizes", sizes: ["M"] });
    const epoch = state.generationEpoch + 1;
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-1",
      epoch,
      variants: [variant()],
    });

    expect(hasActiveTryOnWork(state)).toBe(true);
    state = tryOnDraftReducer(state, { type: "set-sizes", sizes: ["L"] });
    expect(state.sessionId).toBeNull();
    expect(state.variants).toEqual({});
    expect(state.generationEpoch).toBeGreaterThan(epoch);

    const afterStaleResult = tryOnDraftReducer(state, {
      type: "upsert-variant",
      sessionId: "session-1",
      epoch,
      variant: variant({ status: "ready", imageUrl: "https://example.test/old.webp" }),
    });
    expect(afterStaleResult).toBe(state);
  });

  it("accepts only the current epoch even when the session id is reused", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-1",
      epoch: 1,
      variants: [variant()],
    });
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-1",
      epoch: 2,
      variants: [variant({ status: "processing" })],
    });

    const stale = tryOnDraftReducer(state, {
      type: "upsert-variant",
      sessionId: "session-1",
      epoch: 1,
      variant: variant({ status: "error", error: "stale request" }),
    });
    expect(stale).toBe(state);

    const current = tryOnDraftReducer(state, {
      type: "upsert-variant",
      sessionId: "session-1",
      epoch: 2,
      variant: variant({ status: "ready", imageUrl: "https://example.test/current.webp" }),
    });
    expect(current.variants["M:front"]?.status).toBe("ready");
    expect(current.variants["M:front"]?.imageUrl).toContain("current.webp");
  });

  it("persists local photo IDs without persisting expiring result URLs", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, {
      type: "set-photo",
      view: "front",
      photo: { file: {} as File, previewUrl: "blob:front", libraryId: "photo-front" },
    });
    const epoch = state.generationEpoch + 1;
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-1",
      epoch,
      variants: [
        variant({ status: "ready", imageUrl: "https://storage.example.test/ready.webp" }),
        variant({
          id: "22222222-2222-4222-8222-222222222222",
          size: "L",
          status: "processing",
          imageUrl: "https://storage.example.test/not-ready.webp",
        }),
      ],
    });

    const persisted = toPersistedTryOnDraft(state);
    expect(persisted.generationMode).toBe("garment-fidelity");
    expect(persisted.photoIds).toEqual({ front: "photo-front", back: null });
    expect(persisted.variants[0]?.imageUrl).toBeNull();
    expect(persisted.variants[1]?.imageUrl).toBeNull();
  });

  it("invalidates generation when views change while preserving both uploaded photos", () => {
    const frontPhoto = { file: {} as File, previewUrl: "blob:front", libraryId: "front-photo" };
    const backPhoto = { file: {} as File, previewUrl: "blob:back", libraryId: "back-photo" };
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, { type: "set-photo", view: "front", photo: frontPhoto });
    state = tryOnDraftReducer(state, { type: "set-photo", view: "back", photo: backPhoto });
    const epoch = state.generationEpoch + 1;
    state = tryOnDraftReducer(state, {
      type: "begin-generation",
      sessionId: "session-views",
      epoch,
      variants: [variant()],
    });

    const changed = tryOnDraftReducer(state, { type: "set-views", views: ["back", "front"] });

    expect(changed.selectedViews).toEqual(["front", "back"]);
    expect(changed.photos.front).toBe(frontPhoto);
    expect(changed.photos.back).toBe(backPhoto);
    expect(changed.sessionId).toBeNull();
    expect(changed.variants).toEqual({});
    expect(changed.generationEpoch).toBeGreaterThan(epoch);
  });

  it("toggles views independently and always keeps one view selected", () => {
    let state = createInitialTryOnDraftState(true);
    state = tryOnDraftReducer(state, { type: "toggle-view", view: "back" });
    expect(state.selectedViews).toEqual(["front", "back"]);

    state = tryOnDraftReducer(state, { type: "set-active-view", view: "back" });
    state = tryOnDraftReducer(state, { type: "toggle-view", view: "back" });
    expect(state.selectedViews).toEqual(["front"]);
    expect(state.activeView).toBe("front");

    const unchanged = tryOnDraftReducer(state, { type: "toggle-view", view: "front" });
    expect(unchanged).toBe(state);
  });

  it("refreshes result URLs from the server while restoring local photo references", () => {
    const restoredFrontPhoto = {
      file: {} as File,
      previewUrl: "blob:restored-front",
      libraryId: "front-photo",
    };
    const persisted: PersistedDraft = {
      version: TRY_ON_DRAFT_STORAGE_VERSION,
      generationMode: "fit-aware",
      productId: "product-1",
      selectedSizes: ["M", "L"],
      selectedViews: ["front", "back"],
      photoIds: { front: "front-photo", back: null },
      consent: true,
      sessionId: "session-1",
      variants: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          size: "M",
          view: "front",
          status: "ready",
          imageUrl: "https://storage.example.test/result.webp?token=short-lived",
          error: null,
          errorCode: null,
          retrySameRequest: false,
          fitIntent: "regular",
          fitScore: 94,
          sizeRecommendation: "M",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          size: "L",
          view: "front",
          status: "processing",
          imageUrl: null,
          error: null,
          errorCode: null,
          retrySameRequest: true,
          fitIntent: "relaxed",
          fitScore: 76,
          sizeRecommendation: "M",
        },
      ],
      activeSize: "M",
      activeView: "front",
      compare: { mode: "before-after", leftSize: "M", rightSize: "L", splitPercent: 50 },
    };

    const parsed = parsePersistedDraft(persisted);
    expect(parsed).not.toBeNull();
    const hydrated = tryOnDraftReducer(createInitialTryOnDraftState(), {
      type: "hydrate",
      payload: parsed,
      photos: { front: restoredFrontPhoto, back: null },
    });
    const restored = Object.values(hydrated.variants);
    expect(restored.map((item) => item.status)).toEqual(["resume", "resume"]);
    expect(hydrated.variants["M:front"]?.imageUrl).toBeNull();
    expect(hydrated.variants["L:front"]?.imageUrl).toBeNull();
    expect(hydrated.photos.front).toBe(restoredFrontPhoto);
    expect(hydrated.variants["M:front"]).toMatchObject({ fitIntent: "regular", fitScore: 94 });
    expect(hydrated.selectedViews).toEqual(["front", "back"]);
    expect(hydrated.generationMode).toBe("fit-aware");
    expect(hasActiveTryOnWork(hydrated)).toBe(false);
  });

  it("migrates v3 without trusting unavailable or unsafe result URLs", () => {
    const migrated = parsePersistedDraft({
      version: 3,
      productId: "product-v3",
      selectedSizes: ["M"],
      selectedViews: ["front"],
      consent: true,
      sessionId: "session-v3",
      variants: [{
        id: "11111111-1111-4111-8111-111111111111",
        size: "M",
        view: "front",
        status: "ready",
        imageUrl: "javascript:alert(1)",
        error: null,
        errorCode: null,
        retrySameRequest: false,
        fitIntent: "regular",
        fitScore: 90,
        sizeRecommendation: "M",
      }],
      activeSize: "M",
      activeView: "front",
      compare: { mode: "before-after", leftSize: "M", rightSize: "M", splitPercent: 50 },
    });

    expect(migrated?.version).toBe(TRY_ON_DRAFT_STORAGE_VERSION);
    expect(migrated?.photoIds).toEqual({ front: null, back: null });
    expect(migrated?.variants[0]?.imageUrl).toBeNull();
    const hydrated = tryOnDraftReducer(createInitialTryOnDraftState(), {
      type: "hydrate",
      payload: migrated,
    });
    expect(hydrated.variants["M:front"]?.status).toBe("resume");
  });

  it("v4 sonucunun görsel modunu varyanttan çıkarıp süresi dolabilecek URL'yi yeniler", () => {
    const migrated = parsePersistedDraft({
      version: 4,
      productId: "product-v4",
      selectedSizes: ["M"],
      selectedViews: ["front"],
      photoIds: { front: "photo-v4", back: null },
      consent: true,
      sessionId: "session-v4",
      variants: [{
        id: "11111111-1111-4111-8111-111111111111",
        size: "M",
        view: "front",
        status: "ready",
        imageUrl: "https://storage.example.test/result.png",
        error: null,
        errorCode: null,
        retrySameRequest: false,
        fitIntent: "regular",
        fitScore: 90,
        sizeRecommendation: "M",
        renderMode: "fit-aware",
      }],
      activeSize: "M",
      activeView: "front",
      compare: { mode: "before-after", leftSize: "M", rightSize: "M", splitPercent: 50 },
    });

    expect(migrated?.generationMode).toBe("fit-aware");
    expect(migrated?.variants[0]?.imageUrl).toBeNull();
  });

  it("migrates a v2 draft and selects both views when a back variant exists", () => {
    const migrated = parsePersistedDraft({
      version: 2,
      productId: "product-legacy",
      selectedSizes: ["M"],
      consent: true,
      sessionId: "session-legacy",
      variants: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          size: "M",
          view: "front",
          status: "ready",
          errorCode: null,
          retrySameRequest: false,
          fitIntent: "regular",
          fitScore: 90,
          sizeRecommendation: "M",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          size: "M",
          view: "back",
          status: "ready",
          errorCode: null,
          retrySameRequest: false,
          fitIntent: "regular",
          fitScore: 90,
          sizeRecommendation: "M",
        },
      ],
      activeSize: "M",
      activeView: "back",
      compare: { mode: "before-after", leftSize: "M", rightSize: "M", splitPercent: 50 },
    });

    expect(migrated).toMatchObject({
      version: TRY_ON_DRAFT_STORAGE_VERSION,
      selectedViews: ["front", "back"],
      activeView: "back",
    });
  });
});
