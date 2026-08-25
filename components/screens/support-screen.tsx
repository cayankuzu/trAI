"use client";

import { useState, type FormEvent } from "react";
import { SectionHeading } from "@/components/section-heading";
import { supportSchema } from "@/lib/validation";

export function SupportScreen() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = supportSchema.safeParse({
      topic: formData.get("topic"),
      email: formData.get("email"),
      message: formData.get("message"),
    });

    if (!parsed.success) {
      setStatus("error");
      setMessage(parsed.error.issues[0]?.message ?? "Formu kontrol et.");
      return;
    }

    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Mesaj gönderilemedi.");
      form.reset();
      setStatus("success");
      setMessage("Mesajın alındı.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Mesaj gönderilemedi.");
    }
  }

  return (
    <section className="content-page support-page">
      <SectionHeading eyebrow="DESTEK" title="Nasıl yardımcı olabiliriz?" description="Sık sorulan yanıtları incele veya sorununu güvenli destek formuyla paylaş." />
      <div className="support-grid">
        <div className="faq-list">
          <details open><summary>İyi bir fotoğraf nasıl olmalı?</summary><p>Karşıdan çekilmiş, aydınlık ve tüm vücudunun göründüğü bir fotoğraf en iyi sonucu verir.</p></details>
          <details id="usage"><summary>Ücretsiz planda kaç prova var?</summary><p>MVP sürümünde her hesap ayda 5 sanal prova başlatabilir.</p></details>
          <details><summary>Başarısız işlem kotadan düşer mi?</summary><p>Üretim sağlayıcıda başlamadan oluşan teknik hatalar hakkını korur. Sağlayıcı kuyruğu başladıysa maliyet oluşabileceği için hak kullanılmış sayılabilir; güvenli yeniden deneme aynı isteği devam ettirir.</p></details>
          <details><summary>Fotoğrafım saklanıyor mu?</summary><p>Fotoğraflar yalnızca prova üretimi için, kullanıcıya özel ve erişim kontrollü depoda tutulur. İstediğinde hesabınla birlikte silebilirsin.</p></details>
        </div>
        <form className="support-form" onSubmit={handleSubmit} noValidate>
          <h2>Destek mesajı gönder</h2>
          <label>Konu<select name="topic" defaultValue="try-on"><option value="try-on">Prova oluşturma</option><option value="account">Hesap ve gizlilik</option><option value="quota">Kullanım hakkı</option></select></label>
          <label>E-posta<input type="email" name="email" autoComplete="email" placeholder="ornek@mail.com" maxLength={254} required /></label>
          <label>Mesaj<textarea name="message" rows={5} placeholder="Yaşadığın sorunu kısaca anlat…" minLength={10} maxLength={2_000} required /></label>
          <button className="button button-primary" type="submit" disabled={status === "sending"}>{status === "sending" ? "Gönderiliyor…" : "Gönder"}</button>
          {message ? <p className={`form-message is-${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
        </form>
      </div>
    </section>
  );
}
