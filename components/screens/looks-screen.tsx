"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { ProductImageLightbox } from "@/components/try-on/product-image-lightbox";
import type { LookItem } from "@/lib/types";

type LookGroup = {
  id: string;
  name: string;
  lookCount: number;
};

type EditState = {
  id: string;
  title: string;
  groupId: string;
};

type ApiPayload<T> = { data?: T; error?: string };

type ApiCollectionResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

type LookLightboxImage = {
  src: string;
  alt: string;
  title: string;
  description: string;
};

export async function fetchApiCollection<T>(url: string, fallbackError: string): Promise<ApiCollectionResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json() as ApiPayload<T>;
    if (!response.ok || payload.data === undefined) {
      throw new Error(payload.error || fallbackError);
    }
    return { data: payload.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : fallbackError };
  }
}

export function adjustLookGroupCounts(
  groups: LookGroup[],
  previousGroupId: string | null,
  nextGroupId: string | null,
) {
  if (previousGroupId === nextGroupId) return groups;
  return groups.map((group) => {
    if (group.id === previousGroupId) return { ...group, lookCount: Math.max(0, group.lookCount - 1) };
    if (group.id === nextGroupId) return { ...group, lookCount: group.lookCount + 1 };
    return group;
  });
}

export function nextExpandedLookId(currentId: string | null, clickedId: string) {
  return currentId === clickedId ? null : clickedId;
}

export function LooksScreen() {
  const [looks, setLooks] = useState<LookItem[]>([]);
  const [groups, setGroups] = useState<LookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeVariantIds, setActiveVariantIds] = useState<Record<string, string>>({});
  const [groupFilter, setGroupFilter] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [looksLoaded, setLooksLoaded] = useState(false);
  const [lookLightbox, setLookLightbox] = useState<LookLightboxImage | null>(null);
  const lightboxReturnTarget = useRef<HTMLButtonElement | null>(null);
  const lightboxWasOpen = useRef(false);

  const closeLookLightbox = useCallback(() => setLookLightbox(null), []);

  useEffect(() => {
    let active = true;
    async function load() {
      const [looksResult, groupsResult] = await Promise.all([
        fetchApiCollection<LookItem[]>("/api/looks", "Kombinler yüklenemedi."),
        fetchApiCollection<LookGroup[]>("/api/look-groups", "Kombin grupları yüklenemedi."),
      ]);
      if (!active) return;

      if (looksResult.data) {
        setLooks(looksResult.data);
        setLooksLoaded(true);
      }
      if (groupsResult.data) setGroups(groupsResult.data);

      const errors = [looksResult.error, groupsResult.error].filter((error): error is string => Boolean(error));
      if (errors.length > 0) {
        setMessageTone("error");
        setMessage(errors.join(" "));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (lookLightbox) {
      lightboxWasOpen.current = true;
      return;
    }
    if (!lightboxWasOpen.current) return;
    lightboxWasOpen.current = false;
    lightboxReturnTarget.current?.focus();
    lightboxReturnTarget.current = null;
  }, [lookLightbox]);

  const filteredLooks = useMemo(
    () => groupFilter ? looks.filter((look) => look.group?.id === groupFilter) : looks,
    [groupFilter, looks],
  );

  function selectedVariant(look: LookItem) {
    const id = activeVariantIds[look.id];
    return look.variants?.find((variant) => variant.id === id) ?? look.variants?.[0] ?? null;
  }

  async function removeLook(id: string) {
    const removedLook = looks.find((look) => look.id === id);
    setMessage("");
    try {
      const response = await fetch(`/api/looks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json() as ApiPayload<{ id: string }>;
      if (!response.ok) throw new Error(payload.error || "Kombin silinemedi.");
      setLooks((current) => current.filter((look) => look.id !== id));
      if (removedLook?.group?.id) {
        setGroups((current) => adjustLookGroupCounts(current, removedLook.group?.id ?? null, null));
      }
      setPendingDeleteId(null);
      setExpandedId((current) => current === id ? null : current);
      setMessageTone("success");
      setMessage("Kombin kaldırıldı.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Kombin silinemedi.");
    }
  }

  async function updateLook() {
    if (!edit || !edit.title.trim() || saving) return;
    const previousGroupId = looks.find((look) => look.id === edit.id)?.group?.id ?? null;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/looks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edit.id, title: edit.title, groupId: edit.groupId || null }),
      });
      const payload = await response.json() as ApiPayload<{ id: string }>;
      if (!response.ok) throw new Error(payload.error || "Kombin güncellenemedi.");
      const nextGroup = groups.find((group) => group.id === edit.groupId) ?? null;
      setLooks((current) => current.map((look) => look.id === edit.id
        ? { ...look, title: edit.title.trim(), group: nextGroup ? { id: nextGroup.id, name: nextGroup.name } : null }
        : look));
      setGroups((current) => adjustLookGroupCounts(current, previousGroupId, nextGroup?.id ?? null));
      setEdit(null);
      setMessageTone("success");
      setMessage("Kombin bilgileri güncellendi.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Kombin güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-page looks-page-modern">
      <div className="heading-with-action">
        <SectionHeading eyebrow="KOMBİNLER" title="Kombinlerin" description="Görsel provalarını ve ölçü rehberi önerilerini birlikte incele." />
        {looksLoaded && looks.length > 0 ? <Link className="button button-primary" href="/try-on">Yeni prova</Link> : null}
      </div>

      {looksLoaded && groups.length > 0 ? (
        <div className="look-group-filter" role="group" aria-label="Kombin grupları">
          <button className={!groupFilter ? "is-active" : ""} type="button" onClick={() => setGroupFilter("")}>Tümü <span>{looks.length}</span></button>
          {groups.map((group) => <button className={groupFilter === group.id ? "is-active" : ""} type="button" key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name} <span>{group.lookCount}</span></button>)}
        </div>
      ) : null}

      {message ? <p className={`form-message is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
      {loading ? <div className="inline-loading" role="status"><span className="loading-spinner" />Kombinler yükleniyor…</div> : null}
      {!loading && looksLoaded && looks.length === 0 ? (
        <div className="empty-card"><span aria-hidden>◇</span><h2>Henüz kombin yok</h2><p>Bir prova oluşturup beğendiğin sonucu kaydet.</p><Link className="button button-primary" href="/try-on">Prova oluştur</Link></div>
      ) : null}
      {!loading && looksLoaded && looks.length > 0 && filteredLooks.length === 0 ? (
        <div className="empty-card compact-empty"><h2>Bu grupta kombin yok</h2><button className="button button-secondary" type="button" onClick={() => setGroupFilter("")}>Tümünü göster</button></div>
      ) : null}

      <div className="looks-list-modern">
        {filteredLooks.map((look, index) => {
          const expanded = expandedId === look.id;
          const active = selectedVariant(look);
          const displayImage = active?.imageUrl ?? look.image;
          const availableViews = [...new Set(look.variants?.map((variant) => variant.view) ?? [])];
          const activeViewLabel = active?.view === "back" ? "Arka" : "Ön";
          const imageDescription = active
            ? `${active.size} beden · ${activeViewLabel} görünüm`
            : look.meta;
          return (
            <article className={`look-card-modern ${expanded ? "is-expanded" : ""}`} key={look.id}>
              <div className="look-card-trigger">
                <button
                  className="look-card-cover"
                  type="button"
                  aria-label={`${look.title}, ${imageDescription} fotoğrafını büyüt`}
                  onClick={(event) => {
                    lightboxReturnTarget.current = event.currentTarget;
                    setLookLightbox({
                      src: displayImage,
                      alt: `${look.title}, ${imageDescription}`,
                      title: look.title,
                      description: imageDescription,
                    });
                  }}
                >
                  <Image src={displayImage} alt={look.title} fill preload={index === 0} sizes="(max-width: 760px) 100vw, 320px" unoptimized={displayImage.startsWith("http")} />
                  <span className="look-card-zoom" aria-hidden>Büyüt</span>
                </button>
                <button
                  className="look-card-open"
                  type="button"
                  onClick={() => {
                    setExpandedId((current) => nextExpandedLookId(current, look.id));
                    setPendingDeleteId(null);
                    setEdit(null);
                  }}
                  aria-expanded={expanded}
                  aria-controls={`look-details-${look.id}`}
                  aria-label={`${look.title} detaylarını ${expanded ? "kapat" : "aç"}`}
                >
                  <span className="look-card-summary">
                    <span className="look-card-kicker">{look.group?.name ?? "Grupsuz"}</span>
                    <strong>{look.title}</strong>
                    <small>{look.meta}</small>
                    <span className="look-card-chips">{look.selectedSizes?.map((size) => <i className={size === look.recommendedSize ? "is-recommended" : ""} key={size}>{size}</i>)}{availableViews.map((view) => <i key={view}>{view === "front" ? "Ön" : "Arka"}</i>)}</span>
                  </span>
                  <span className="look-expand-symbol" aria-hidden>{expanded ? "−" : "+"}</span>
                </button>
              </div>

              {expanded ? (
                <div className="look-expanded-panel" id={`look-details-${look.id}`}>
                  {look.variants && look.variants.length > 0 ? (
                    <div className="saved-variant-picker" role="group" aria-label={`${look.title} sonuçları`}>
                      {look.variants.map((variant) => <button className={(active?.id ?? look.variants?.[0]?.id) === variant.id ? "is-active" : ""} type="button" aria-pressed={(active?.id ?? look.variants?.[0]?.id) === variant.id} key={variant.id} onClick={() => setActiveVariantIds((current) => ({ ...current, [look.id]: variant.id }))}><strong>{variant.size}</strong><small>{variant.view === "front" ? "Ön" : "Arka"}</small></button>)}
                    </div>
                  ) : null}
                  <div className="look-detail-grid">
                    <div><small>ÖNERİLEN BEDEN</small><strong>{look.recommendedSize ?? "—"}</strong></div>
                    <div><small>KAYITLI SONUÇ</small><strong>{look.variants?.length ?? 1}</strong></div>
                    <div><small>GRUP</small><strong>{look.group?.name ?? "Grupsuz"}</strong></div>
                    {active ? <div><small>{active.renderMode === "garment-fidelity" ? "ÜRÜN DETAYI" : "KALIP GÖRSELİ · BETA"}</small><strong>{active.renderMode === "garment-fidelity" ? `Ürün görünümü · ${active.view === "front" ? "Ön" : "Arka"}` : `${active.size} · ${active.view === "front" ? "Ön" : "Arka"}`}</strong></div> : null}
                  </div>

                  {edit?.id === look.id ? (
                    <div className="look-edit-panel">
                      <label>Kombin adı<input value={edit.title} maxLength={100} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /></label>
                      <label>Grup<select value={edit.groupId} onChange={(event) => setEdit({ ...edit, groupId: event.target.value })}><option value="">Grupsuz</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
                      <div><button className="button button-secondary" type="button" onClick={() => setEdit(null)} disabled={saving}>Vazgeç</button><button className="button button-primary" type="button" onClick={updateLook} disabled={saving || !edit.title.trim()}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
                    </div>
                  ) : null}

                  {pendingDeleteId === look.id ? (
                    <div className="look-delete-confirm"><p>Bu kombini ve kart kaydını kaldırmak istiyor musun? Üretilen prova geçmişi silinmez.</p><div><button type="button" onClick={() => setPendingDeleteId(null)}>Vazgeç</button><button className="is-danger" type="button" onClick={() => removeLook(look.id)}>Kombini kaldır</button></div></div>
                  ) : null}

                  <div className="look-expanded-actions">
                    {look.productUrl ? <a href={look.productUrl} target="_blank" rel="noopener noreferrer">Ürüne git ↗</a> : null}
                    <button type="button" onClick={() => setEdit({ id: look.id, title: look.title, groupId: look.group?.id ?? "" })}>Adı / grubu düzenle</button>
                    <button className="is-danger" type="button" onClick={() => setPendingDeleteId(look.id)}>Sil</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <ProductImageLightbox
        image={lookLightbox}
        eyebrow="KOMBİN GÖRSELİ"
        title={lookLightbox?.title}
        description={lookLightbox?.description}
        onClose={closeLookLightbox}
      />
    </section>
  );
}
