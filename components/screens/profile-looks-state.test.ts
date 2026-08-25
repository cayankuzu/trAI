import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adjustLookGroupCounts, fetchApiCollection, nextExpandedLookId } from "./looks-screen";

const profileScreen = readFileSync(
  new URL("./profile-screen.tsx", import.meta.url),
  "utf8",
);

const looksScreen = readFileSync(
  new URL("./looks-screen.tsx", import.meta.url),
  "utf8",
);

const productImageLightbox = readFileSync(
  new URL("../try-on/product-image-lightbox.tsx", import.meta.url),
  "utf8",
);

const appShell = readFileSync(
  new URL("../app-shell.tsx", import.meta.url),
  "utf8",
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profil düzenleme durumu", () => {
  it("kombinler sekmesini profil ayarlarında tekrar etmez", () => {
    expect(profileScreen).not.toContain("Kaydedilmiş kombinler");
    expect(profileScreen).not.toContain('href="/looks"');
  });

  it("kiloyu isteğe bağlı ve güvenli aralıkta toplar", () => {
    expect(profileScreen).toContain('{ key: "weightKg", label: "Kilo", unit: "kg", min: 20, max: 350 }');
    expect(profileScreen).toContain('weightKg: optionalNumber("weightKg")');
  });

  it("düzenleyiciyi açarken ve kapatırken kayıtlı pantolon beden sistemini geri yükler", () => {
    expect(profileScreen).toMatch(/function openEditor\(\)[\s\S]*setBottomSizeSystem\(profile\.bottomSizeSystem\)/);
    expect(profileScreen).toMatch(/function closeEditor\(\)[\s\S]*setBottomSizeSystem\(profile\.bottomSizeSystem\)/);
    expect(profileScreen).toContain("onClick={editing ? closeEditor : openEditor}");
    expect(profileScreen).toContain("onClick={closeEditor}");
  });

  it("kayıt sürerken ikinci gönderimi ve form kapatmayı engeller", () => {
    expect(profileScreen).toContain("if (saving) return;");
    expect(profileScreen).toContain("setSaving(true);");
    expect(profileScreen).toMatch(/finally\s*{\s*setSaving\(false\)/);
    expect(profileScreen).toContain('type="submit" disabled={saving}');
    expect(profileScreen).toContain("onClick={closeEditor} disabled={saving}");
  });
});

describe("ortak üst bar", () => {
  it("oturum durumu rozetini göstermez", () => {
    expect(appShell).not.toContain("Güvenli oturum");
    expect(appShell).not.toContain("mode-pill");
  });
});

describe("kombin grubu durumu", () => {
  const groups = [
    { id: "daily", name: "Günlük", lookCount: 2 },
    { id: "office", name: "Ofis", lookCount: 3 },
  ];

  it("taşımada eski grubu azaltıp yeni grubu artırır", () => {
    expect(adjustLookGroupCounts(groups, "daily", "office")).toEqual([
      { id: "daily", name: "Günlük", lookCount: 1 },
      { id: "office", name: "Ofis", lookCount: 4 },
    ]);
  });

  it("silmede sayacı sıfırın altına indirmez ve aynı grupta gereksiz değişiklik yapmaz", () => {
    const emptyGroup = [{ id: "daily", name: "Günlük", lookCount: 0 }];
    expect(adjustLookGroupCounts(emptyGroup, "daily", null)[0]?.lookCount).toBe(0);
    expect(adjustLookGroupCounts(groups, "daily", "daily")).toBe(groups);
  });
});

describe("kombin kartı etkileşimleri", () => {
  it("karta ilk tıklamada detayı açar, aynı karta tekrar tıklamada kapatır", () => {
    expect(nextExpandedLookId(null, "look-1")).toBe("look-1");
    expect(nextExpandedLookId("look-1", "look-1")).toBeNull();
    expect(nextExpandedLookId("look-1", "look-2")).toBe("look-2");
  });

  it("görsel büyütme ile kart detay düğmelerini ayrı ve erişilebilir tutar", () => {
    expect(looksScreen).toContain('className="look-card-cover"');
    expect(looksScreen).toContain('className="look-card-open"');
    expect(looksScreen).toContain('aria-expanded={expanded}');
    expect(looksScreen).toContain('setLookLightbox({');
    expect(looksScreen).toContain('<ProductImageLightbox');
  });

  it("imzalı uzak sonuç görsellerini lightbox içinde doğrudan gösterebilir", () => {
    expect(productImageLightbox).toContain('unoptimized={image.src.startsWith("http")}');
    expect(productImageLightbox).toContain('if (event.key === "Escape") onClose();');
    expect(productImageLightbox).toContain('aria-modal="true"');
  });
});

describe("kombin ekranı kısmi yükleme", () => {
  it("grup isteği hata verse de başarılı kombin yanıtını korur", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/looks") {
        return { ok: true, json: async () => ({ data: [{ id: "look-1" }] }) } as Response;
      }
      return { ok: false, json: async () => ({ error: "Gruplar kullanılamıyor." }) } as Response;
    }));

    const [looksResult, groupsResult] = await Promise.all([
      fetchApiCollection<Array<{ id: string }>>("/api/looks", "Kombinler yüklenemedi."),
      fetchApiCollection<Array<{ id: string }>>("/api/look-groups", "Gruplar yüklenemedi."),
    ]);

    expect(looksResult).toEqual({ data: [{ id: "look-1" }], error: null });
    expect(groupsResult).toEqual({ data: null, error: "Gruplar kullanılamıyor." });
  });

  it("kombin isteği başarısızken yanıltıcı boş ekranı göstermemek için başarı bayrağını kullanır", () => {
    expect(looksScreen).toContain("setLooksLoaded(true)");
    expect(looksScreen).toContain("!loading && looksLoaded && looks.length === 0");
    expect(looksScreen).toContain("fetchApiCollection<LookItem[]>");
    expect(looksScreen).toContain("fetchApiCollection<LookGroup[]>");
  });
});
