"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SectionHeading } from "@/components/section-heading";
import { appConfig } from "@/lib/config";
import { getDemoProfile, saveDemoProfile } from "@/lib/demo-store";
import { BOTTOM_SIZE_OPTIONS, TOP_SIZE_OPTIONS } from "@/lib/size-options";
import type { BottomSizeSystem, Gender, ProfileData } from "@/lib/types";

type MeasurementKey = "heightCm" | "weightKg" | "chestCm" | "waistCm" | "hipCm";

const measurementFields: Array<{
  key: MeasurementKey;
  label: string;
  unit: "cm" | "kg";
  min: number;
  max: number;
}> = [
  { key: "heightCm", label: "Boy", unit: "cm", min: 80, max: 250 },
  { key: "weightKg", label: "Kilo", unit: "kg", min: 20, max: 350 },
  { key: "chestCm", label: "Göğüs", unit: "cm", min: 40, max: 200 },
  { key: "waistCm", label: "Bel", unit: "cm", min: 40, max: 200 },
  { key: "hipCm", label: "Kalça", unit: "cm", min: 40, max: 200 },
];

const genderLabels: Record<Gender, string> = {
  female: "Kadın",
  male: "Erkek",
  other: "Diğer",
};

export function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [bottomSizeSystem, setBottomSizeSystem] = useState<BottomSizeSystem>("EU");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!appConfig.isSupabaseConfigured) {
          if (active) {
            const demoProfile = getDemoProfile();
            setProfile(demoProfile);
            setBottomSizeSystem(demoProfile.bottomSizeSystem);
          }
          return;
        }
        const response = await fetch("/api/profile");
        const payload = (await response.json()) as { data?: ProfileData; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Profil yüklenemedi.");
        if (active) {
          setProfile(payload.data);
          setBottomSizeSystem(payload.data.bottomSizeSystem);
        }
      } catch (error) {
        if (active) {
          setMessageTone("error");
          setMessage(error instanceof Error ? error.message : "Profil yüklenemedi.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function openEditor() {
    if (!profile) return;
    setBottomSizeSystem(profile.bottomSizeSystem);
    setEditing(true);
  }

  function closeEditor() {
    if (profile) setBottomSizeSystem(profile.bottomSizeSystem);
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? Number(value) : null;
    };
    const usualTopSize = String(form.get("usualTopSize") ?? "").trim();
    const next: ProfileData = {
      fullName: String(form.get("fullName") ?? "").trim(),
      gender: String(form.get("gender") ?? "other") as Gender,
      heightCm: optionalNumber("heightCm"),
      weightKg: optionalNumber("weightKg"),
      chestCm: optionalNumber("chestCm"),
      waistCm: optionalNumber("waistCm"),
      hipCm: optionalNumber("hipCm"),
      usualTopSize: usualTopSize ? usualTopSize as NonNullable<ProfileData["usualTopSize"]> : null,
      usualBottomSize: String(form.get("usualBottomSize") ?? "").trim() || null,
      bottomSizeSystem,
    };
    setMessage("");
    setSaving(true);
    try {
      if (appConfig.isSupabaseConfigured) {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const payload = (await response.json()) as { data?: ProfileData; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Profil kaydedilemedi.");
        setProfile(payload.data);
        setBottomSizeSystem(payload.data.bottomSizeSystem);
      } else {
        saveDemoProfile(next);
        setProfile(next);
        setBottomSizeSystem(next.bottomSizeSystem);
      }
      setEditing(false);
      setMessageTone("success");
      setMessage("Profil bilgilerin güncellendi.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Profil kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const initials = profile?.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR") ?? "";

  return (
    <section className="content-page">
      <SectionHeading
        eyebrow="PROFİL"
        title={loading ? "Profilin yükleniyor" : profile?.fullName ?? "Profil kullanılamıyor"}
        description="Ölçülerini ve alışılmış bedenlerini kaydet. Bunlar beden önerisini belirler; görsel sonuç fiziksel kalıp garantisi değildir."
      />
      {message ? <p className={`form-message is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
      {loading ? <div className="inline-loading" role="status"><span className="loading-spinner" />Profil yükleniyor…</div> : null}
      {profile ? <div className="profile-grid">
          <article className="profile-card">
            <div className="profile-avatar" aria-hidden>{initials}</div>
            <div><h2>Ana model profili</h2><p>{`${genderLabels[profile.gender]} · Kişisel profil`}</p></div>
            <span className="result-pill is-ready">Aktif</span>
          </article>
          <article className="info-card">
            <div className="card-title-row"><div><p className="eyebrow">BEDEN ÖLÇÜLERİ</p><h2>Ölçü özeti</h2></div><button className="text-button" type="button" onClick={editing ? closeEditor : openEditor} disabled={saving}>{editing ? "Kapat" : "Düzenle"}</button></div>
            <dl className="measurement-grid">
              {measurementFields.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{profile[key] === null ? "Eklenmedi" : `${profile[key]} ${unit}`}</dd></div>)}
              <div><dt>Üst beden</dt><dd>{profile.usualTopSize ?? "Eklenmedi"}</dd></div>
              <div><dt>Pantolon</dt><dd>{profile.usualBottomSize ? `${profile.bottomSizeSystem} ${profile.usualBottomSize}` : "Eklenmedi"}</dd></div>
            </dl>
          </article>
        </div> : null}
      {editing && profile ? (
        <form className="profile-edit-form" onSubmit={save}>
          <h2>Profil bilgilerini düzenle</h2>
          <label className="full-row">Ad soyad<input name="fullName" defaultValue={profile.fullName} minLength={2} maxLength={80} required /></label>
          <fieldset className="choice-fieldset full-row">
            <legend>Cinsiyet</legend>
            <div className="choice-options">
              {(Object.entries(genderLabels) as Array<[Gender, string]>).map(([value, label]) => (
                <label className="choice-option" key={value}><input type="radio" name="gender" value={value} defaultChecked={profile.gender === value} required /><span>{label}</span></label>
              ))}
            </div>
          </fieldset>
          {measurementFields.map(({ key, label, unit, min, max }) => <label key={key}>{label} ({unit}, isteğe bağlı)<input name={key} type="number" defaultValue={profile[key] ?? ""} min={min} max={max} step={1} inputMode="numeric" /></label>)}
          <label>
            Alışılmış üst beden
            <select name="usualTopSize" defaultValue={profile.usualTopSize ?? ""}>
              <option value="">Seçme</option>
              {TOP_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <label>
            Pantolon beden sistemi
            <select name="bottomSizeSystem" value={bottomSizeSystem} onChange={(event) => setBottomSizeSystem(event.target.value as BottomSizeSystem)}>
              <option value="EU">TR / EU</option>
              <option value="W">Jean bel (W)</option>
            </select>
          </label>
          <label>
            Alışılmış pantolon bedeni
            <select name="usualBottomSize" defaultValue={profile.bottomSizeSystem === bottomSizeSystem ? profile.usualBottomSize ?? "" : ""} key={bottomSizeSystem}>
              <option value="">Seçme</option>
              {BOTTOM_SIZE_OPTIONS[bottomSizeSystem].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="button-row full-row"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button><button className="button button-secondary" type="button" onClick={closeEditor} disabled={saving}>Vazgeç</button></div>
        </form>
      ) : null}
      <div className="settings-list">
        <Link href="/settings"><span><strong>Ayarlar ve gizlilik</strong><small>Hesap, izinler ve kullanım</small></span><b aria-hidden>→</b></Link>
        <Link href="/support"><span><strong>Yardım ve destek</strong><small>Sık sorulan sorular ve iletişim</small></span><b aria-hidden>→</b></Link>
      </div>
    </section>
  );
}
