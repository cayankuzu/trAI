export type TryOnProviderErrorCode =
  | "provider_config"
  | "provider_quota"
  | "provider_rate_limit"
  | "provider_input"
  | "provider_start_timeout"
  | "provider_submit_uncertain"
  | "provider_cancelled"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_safety"
  | "provider_result_unavailable"
  | "provider_output";

export class TryOnProviderError extends Error {
  constructor(
    public readonly code: TryOnProviderErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TryOnProviderError";
  }
}

type HttpLikeError = Error & {
  status?: number;
  timeoutType?: string;
};

export class FalSubmitUncertainError extends Error {
  constructor() {
    super(
      "Sanal prova isteğinin sağlayıcıya ulaşıp ulaşmadığı doğrulanamadı. Gereksiz ikinci bir üretim başlatmamak için otomatik tekrar yapılmadı.",
    );
    this.name = "FalSubmitUncertainError";
  }
}

export function mapFalError(error: unknown): TryOnProviderError {
  if (error instanceof TryOnProviderError) return error;

  if (error instanceof FalSubmitUncertainError) {
    return new TryOnProviderError(
      "provider_submit_uncertain",
      error.message,
      503,
    );
  }

  const candidate = error instanceof Error ? (error as HttpLikeError) : null;
  const status = candidate?.status;
  const isAbort = candidate?.name === "AbortError" || candidate?.name === "TimeoutError";

  if (status === 504 && candidate?.timeoutType === "user") {
    return new TryOnProviderError(
      "provider_start_timeout",
      "Sanal prova kuyruğu zamanında başlayamadı. Biraz sonra yeni bir prova başlat.",
      504,
    );
  }

  if (isAbort || status === 408 || status === 504) {
    return new TryOnProviderError(
      "provider_timeout",
      "Sanal prova beklenenden uzun sürdü. Aynı prova isteğini biraz sonra güvenle yeniden kontrol edebilirsin.",
      504,
    );
  }

  if (status === 401 || status === 403) {
    return new TryOnProviderError(
      "provider_config",
      "Sanal prova servisi henüz kullanıma hazır değil. Lütfen daha sonra tekrar dene.",
      503,
    );
  }

  if (status === 402) {
    return new TryOnProviderError(
      "provider_quota",
      "Sanal prova kredisi şu anda kullanılamıyor. Kredi yenilendiğinde tekrar deneyebilirsin.",
      503,
    );
  }

  if (status === 429) {
    return new TryOnProviderError(
      "provider_rate_limit",
      "Sanal prova servisi şu anda yoğun. Kısa bir süre sonra tekrar dene.",
      429,
    );
  }

  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new TryOnProviderError(
      "provider_input",
      "Fotoğraflar bu prova için işlenemedi. Net, tam boy bir kişi ve tek ürün fotoğrafıyla tekrar dene.",
      422,
    );
  }

  return new TryOnProviderError(
    "provider_unavailable",
    "Sanal prova servisine şu anda ulaşılamıyor. Biraz sonra tekrar dene.",
    503,
  );
}

export function missingFalKeyError() {
  return new TryOnProviderError(
    "provider_config",
    "Sanal prova servisi henüz etkinleştirilmedi.",
    503,
  );
}

export function mapFalResultDownloadError(code: string) {
  if (code === "page_unavailable") {
    return new TryOnProviderError(
      "provider_result_unavailable",
      "Sanal prova tamamlandı ancak geçici sonuç görseli henüz alınamadı. Yeni kredi harcamadan aynı sonucu tekrar kontrol edebilirsin.",
      502,
    );
  }

  return new TryOnProviderError(
    "provider_output",
    "Sanal prova servisi geçerli bir sonuç görseli döndürmedi. Fotoğraflarını kontrol edip yeni bir prova başlat.",
    502,
  );
}
