"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { TryOnView } from "@/components/try-on-draft-provider";
import type { TryOnPhotoLibrarySummary } from "@/lib/try-on-photo-library";
import type { LookItem, TryOnResult } from "@/lib/types";

type PhotoSourceTab = "device" | "recent" | "looks";

type ApiPayload<T> = {
  data?: T;
  error?: string;
};

type SavedLookVariant = TryOnResult & {
  lookId: string;
  lookTitle: string;
};

type PhotoSourcePickerProps = {
  view: TryOnView;
  recentPhotos: TryOnPhotoLibrarySummary[];
  photoLibraryReady: boolean;
  busy?: boolean;
  onClose: () => void;
  onChooseFile: (file: File, origin: "device" | "look") => Promise<boolean>;
  onChooseRecent: (photoId: string) => Promise<boolean>;
  onDeleteRecent: (photoId: string) => Promise<void>;
};

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return normalized || "kayitli-kombin";
}

function extensionForType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export function PhotoSourcePicker({
  view,
  recentPhotos,
  photoLibraryReady,
  busy = false,
  onClose,
  onChooseFile,
  onChooseRecent,
  onDeleteRecent,
}: PhotoSourcePickerProps) {
  const [tab, setTab] = useState<PhotoSourceTab>("device");
  const [looks, setLooks] = useState<LookItem[]>([]);
  const [looksLoading, setLooksLoading] = useState(false);
  const [looksLoaded, setLooksLoaded] = useState(false);
  const [choosingId, setChoosingId] = useState("");
  const [error, setError] = useState("");

  const savedVariants = useMemo<SavedLookVariant[]>(() => looks.flatMap((look) =>
    (look.variants ?? [])
      .filter((variant) => variant.view === view)
      .map((variant) => ({ ...variant, lookId: look.id, lookTitle: look.title })),
  ).slice(0, 30), [looks, view]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !choosingId && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, choosingId, onClose]);

  useEffect(() => {
    if (tab !== "looks" || looksLoaded) return;
    const controller = new AbortController();
    setLooksLoading(true);
    setError("");
    void fetch("/api/looks", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ApiPayload<LookItem[]> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || "Kombinler yüklenemedi.");
        setLooks(payload.data);
        setLooksLoaded(true);
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Kombinler yüklenemedi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLooksLoading(false);
      });
    return () => controller.abort();
  }, [looksLoaded, tab]);

  async function chooseFile(file: File, origin: "device" | "look") {
    setError("");
    setChoosingId(origin);
    try {
      const selected = await onChooseFile(file, origin);
      if (selected) onClose();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Fotoğraf seçilemedi.");
    } finally {
      setChoosingId("");
    }
  }

  async function handleDeviceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await chooseFile(file, "device");
  }

  async function chooseRecent(photoId: string) {
    setError("");
    setChoosingId(photoId);
    try {
      const selected = await onChooseRecent(photoId);
      if (selected) onClose();
      else setError("Fotoğraf bu cihazda bulunamadı. Listeyi yenileyip tekrar dene.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Fotoğraf seçilemedi.");
    } finally {
      setChoosingId("");
    }
  }

  async function chooseSavedVariant(variant: SavedLookVariant) {
    setError("");
    setChoosingId(variant.id);
    try {
      const response = await fetch(variant.imageUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Kombin görselinin bağlantısı yenilenemedi. Pencereyi kapatıp tekrar aç.");
      const blob = await response.blob();
      const type = blob.type.toLowerCase();
      if (!ACCEPTED_IMAGE_TYPES.has(type)) throw new Error("Kombin sonucu desteklenen bir fotoğraf biçiminde değil.");
      const name = `${safeFileName(variant.lookTitle)}-${variant.size}-${variant.view}.${extensionForType(type)}`;
      const file = new File([blob], name, { type, lastModified: Date.now() });
      const selected = await onChooseFile(file, "look");
      if (selected) onClose();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Kombin fotoğrafı seçilemedi.");
    } finally {
      setChoosingId("");
    }
  }

  return (
    <div className="modal-backdrop photo-source-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !choosingId && !busy) onClose();
    }}>
      <section className="photo-source-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-source-title">
        <header>
          <div><small>{view === "front" ? "ÖN GÖRÜNÜM" : "ARKA GÖRÜNÜM"}</small><h2 id="photo-source-title">Fotoğraf seç</h2></div>
          <button type="button" aria-label="Fotoğraf seçiciyi kapat" onClick={onClose} disabled={Boolean(choosingId) || busy}>×</button>
        </header>

        <div className="photo-source-tabs" role="tablist" aria-label="Fotoğraf kaynağı">
          <button type="button" role="tab" aria-selected={tab === "device"} className={tab === "device" ? "is-active" : ""} onClick={() => { setTab("device"); setError(""); }} autoFocus>Cihaz</button>
          <button type="button" role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? "is-active" : ""} onClick={() => { setTab("recent"); setError(""); }}>Bu cihazda</button>
          <button type="button" role="tab" aria-selected={tab === "looks"} className={tab === "looks" ? "is-active" : ""} onClick={() => { setTab("looks"); setError(""); }}>Kayıtlı kombinler</button>
        </div>

        <div className="photo-source-content">
          {tab === "device" ? (
            <label className="photo-device-drop">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleDeviceFile(event)} disabled={Boolean(choosingId) || busy} />
              <span aria-hidden>＋</span>
              <strong>{choosingId === "device" ? "Fotoğraf kontrol ediliyor…" : "Cihazdan fotoğraf seç"}</strong>
              <small>JPG, PNG veya WebP · en fazla 6 MB</small>
            </label>
          ) : null}

          {tab === "recent" ? (
            !photoLibraryReady ? <div className="photo-source-state"><span className="loading-spinner" /><p>Fotoğraflar hazırlanıyor…</p></div>
              : recentPhotos.length === 0 ? <div className="photo-source-state"><strong>Henüz fotoğraf yok</strong><p>Cihazdan seçtiğin fotoğraflar burada görünür.</p></div>
                : <div className="photo-source-grid">{recentPhotos.map((photo) => (
                  <article key={photo.id} className="photo-source-card">
                    <button type="button" className="photo-source-choice" onClick={() => void chooseRecent(photo.id)} disabled={Boolean(choosingId) || busy}>
                      <span><Image src={photo.previewUrl} alt={photo.name || "Önceki fotoğraf"} fill unoptimized /></span>
                      <strong>{choosingId === photo.id ? "Seçiliyor…" : photo.name}</strong>
                      <small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(photo.lastUsedAt))}</small>
                    </button>
                    <button type="button" className="photo-source-delete" onClick={() => void onDeleteRecent(photo.id)} disabled={Boolean(choosingId) || busy} aria-label={`${photo.name} fotoğrafını bu cihazdan sil`}>Sil</button>
                  </article>
                ))}</div>
          ) : null}

          {tab === "looks" ? (
            looksLoading ? <div className="photo-source-state"><span className="loading-spinner" /><p>Kombinler yükleniyor…</p></div>
              : savedVariants.length === 0 && looksLoaded ? <div className="photo-source-state"><strong>Uygun kombin fotoğrafı yok</strong><p>Bu görünümde kaydettiğin sonuçlar burada listelenir.</p></div>
                : <div className="photo-source-grid">{savedVariants.map((variant) => (
                  <button type="button" className="photo-source-choice" key={variant.id} onClick={() => void chooseSavedVariant(variant)} disabled={Boolean(choosingId) || busy}>
                    <span><Image src={variant.imageUrl} alt={`${variant.lookTitle}, ${variant.size} beden`} fill unoptimized /></span>
                    <strong>{choosingId === variant.id ? "İndiriliyor…" : variant.lookTitle}</strong>
                    <small>AI sonucu · {variant.size} · {variant.view === "front" ? "Ön" : "Arka"}</small>
                  </button>
                ))}</div>
          ) : null}
        </div>

        {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
        <footer><span>Fotoğraf geçmişi yalnız bu cihazda saklanır.</span><button type="button" onClick={onClose} disabled={Boolean(choosingId) || busy}>Vazgeç</button></footer>
      </section>
    </div>
  );
}
