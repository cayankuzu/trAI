import { describe, expect, it } from "vitest";
import {
  FalSubmitUncertainError,
  mapFalError,
  mapFalResultDownloadError,
  TryOnProviderError,
} from "./fal-errors";

describe("mapFalError", () => {
  it("kredi ve oran sınırı hatalarını ayrı kullanıcı mesajlarına dönüştürür", () => {
    const quota = Object.assign(new Error("payment required"), { status: 402 });
    const rateLimit = Object.assign(new Error("too many requests"), { status: 429 });

    expect(mapFalError(quota)).toMatchObject({ code: "provider_quota", status: 503 });
    expect(mapFalError(rateLimit)).toMatchObject({ code: "provider_rate_limit", status: 429 });
  });

  it("AbortError durumunu zaman aşımı olarak işaretler", () => {
    const timeout = new DOMException("aborted", "AbortError");
    expect(mapFalError(timeout)).toMatchObject({ code: "provider_timeout", status: 504 });
  });

  it("kullanıcı tanımlı fal başlangıç zaman aşımını terminal hata olarak ayırır", () => {
    const timeout = Object.assign(new Error("start timeout"), {
      status: 504,
      timeoutType: "user",
    });

    expect(mapFalError(timeout)).toMatchObject({
      code: "provider_start_timeout",
      status: 504,
    });
  });

  it("bilinen uygulama hatasını değiştirmeden geçirir", () => {
    const known = new TryOnProviderError("provider_output", "çıktı yok", 502);
    expect(mapFalError(known)).toBe(known);
  });

  it("belirsiz submit sonucunu otomatik tekrar edilmeyen ayrı hata yapar", () => {
    expect(mapFalError(new FalSubmitUncertainError())).toMatchObject({
      code: "provider_submit_uncertain",
      status: 503,
    });
  });
});

describe("mapFalResultDownloadError", () => {
  it("erişilemeyen geçici sonucu aynı istekle kurtarılabilir output hatası yapar", () => {
    const error = mapFalResultDownloadError("page_unavailable");
    expect(error).toMatchObject({
      code: "provider_result_unavailable",
      status: 502,
    });
    expect(error.message).toContain("aynı sonucu tekrar kontrol");
  });

  it("geçersiz sonuç dosyasını provider output hatası olarak işaretler", () => {
    expect(mapFalResultDownloadError("invalid_image")).toMatchObject({
      code: "provider_output",
      status: 502,
    });
  });
});
