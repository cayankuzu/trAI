"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { useTryOnDraft } from "@/components/try-on-draft-provider";
import { clearDemoData } from "@/lib/demo-store";
import { clearTryOnPhotos } from "@/lib/try-on-photo-library";

export function SettingsScreen() {
  const { userId, resetDraft } = useTryOnDraft();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function deleteAccount() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Hesap silinemedi.");
      await clearTryOnPhotos(userId).catch(() => undefined);
      resetDraft();
      clearDemoData();
      window.location.assign("/states/account-deleted");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Hesap silinemedi.");
    }
  }

  return (
    <section className="content-page narrow-page">
      <SectionHeading eyebrow="AYARLAR" title="Ayarlar ve gizlilik" description="Hesap güvenliğini, kullanım bilgilerini ve yasal metinleri tek yerden yönet." />
      <div className="settings-list">
        <Link href="/profile"><span><strong>Profil ve beden ölçüleri</strong><small>Ana model profili</small></span><b aria-hidden>→</b></Link>
        <Link href="/change-password"><span><strong>Şifre ve güvenlik</strong><small>Hesap şifreni güvenle değiştir</small></span><b aria-hidden>→</b></Link>
        <Link href="/legal/privacy"><span><strong>Gizlilik ve veriler</strong><small>Verilerinin nasıl işlendiğini incele</small></span><b aria-hidden>→</b></Link>
        <Link href="/support#usage"><span><strong>Plan ve kullanım</strong><small>Ücretsiz plan · ayda 5 sanal prova</small></span><b aria-hidden>→</b></Link>
        <Link href="/support"><span><strong>Yardım merkezi</strong><small>Destek ve sık sorulan sorular</small></span><b aria-hidden>→</b></Link>
      </div>
      <div className="danger-zone">
        <div><h2>Hesabı sil</h2><p>Bu işlem fotoğraflarını ve kaydettiğin tüm sonuçları kalıcı olarak siler.</p></div>
        <button className="button button-danger" type="button" onClick={() => dialogRef.current?.showModal()}>Hesabı sil</button>
      </div>
      <dialog className="confirm-dialog" ref={dialogRef} aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onClose={() => { setConfirmation(""); setPassword(""); setMessage(""); setStatus("idle"); }}>
        <form method="dialog" className="dialog-close-form"><button type="submit" aria-label="Pencereyi kapat">×</button></form>
        <p className="eyebrow">GERİ ALINAMAZ İŞLEM</p>
        <h2 id="delete-account-title">Hesabını kalıcı olarak sil?</h2>
        <p id="delete-account-description">Profilin, ölçülerin, fotoğrafların ve kombinlerin silinir. Devam etmek için aşağıya <strong>HESABIMI SİL</strong> yaz.</p>
        <label>Güvenlik onayı<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <label>Mevcut şifre<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={72} /></label>
        {message ? <p className="form-message is-error" role="alert">{message}</p> : null}
        <div className="button-row">
          <form method="dialog"><button className="button button-secondary" type="submit">Vazgeç</button></form>
          <button className="button button-danger" type="button" onClick={deleteAccount} disabled={confirmation !== "HESABIMI SİL" || password.length === 0 || status === "loading"}>{status === "loading" ? "Siliniyor…" : "Kalıcı olarak sil"}</button>
        </div>
      </dialog>
    </section>
  );
}
