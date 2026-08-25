import type { FalClient } from "@fal-ai/client";
import { mapFalError, TryOnProviderError } from "./fal-errors";
import {
  FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
  FAL_PRIMARY_TRY_ON_ENDPOINT,
  type FalTryOnEndpoint,
  type FashnGarmentCategory,
  type FashnGarmentPhotoType,
} from "./fal-endpoints";
import { buildFitPrompt, DEFAULT_FIT_PROMPT, type FitPromptInput } from "./fit-prompt";

export const FAL_TRY_ON_ENDPOINT = FAL_PRIMARY_TRY_ON_ENDPOINT;
const DEFAULT_TIMEOUT_MS = 100_000;

export type GenerateTryOnInput = {
  endpoint?: FalTryOnEndpoint;
  personImageUrl: string;
  clothingImageUrl: string;
  garmentCategory?: FashnGarmentCategory;
  garmentPhotoType?: FashnGarmentPhotoType;
  fit?: FitPromptInput;
  seed?: number;
  existingRequestId?: string | null;
  onSubmitted?: (requestId: string) => Promise<void>;
  timeoutMs?: number;
};

export type FalTryOnOutput = {
  requestId: string;
  imageUrl: string;
};

export type SubmitFalQueueRequest = (input: {
  endpoint: FalTryOnEndpoint;
  personImageUrl: string;
  clothingImageUrl: string;
  garmentCategory?: FashnGarmentCategory;
  garmentPhotoType?: FashnGarmentPhotoType;
  prompt: string;
  seed?: number;
  abortSignal: AbortSignal;
}) => Promise<string>;

function wait(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runFalQueue(
  client: FalClient,
  input: GenerateTryOnInput,
  submitRequest: SubmitFalQueueRequest,
): Promise<FalTryOnOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("fal.ai timeout", "TimeoutError"));
  }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const endpoint = input.endpoint ?? FAL_TRY_ON_ENDPOINT;
  let requestId = input.existingRequestId ?? null;

  try {
    if (!requestId) {
      requestId = await submitRequest({
        endpoint,
        personImageUrl: input.personImageUrl,
        clothingImageUrl: input.clothingImageUrl,
        garmentCategory: input.garmentCategory,
        garmentPhotoType: input.garmentPhotoType,
        prompt: input.fit ? buildFitPrompt(input.fit) : DEFAULT_FIT_PROMPT,
        seed: input.seed,
        abortSignal: controller.signal,
      });
      try {
        await input.onSubmitted?.(requestId);
      } catch {
        try {
          await client.queue.cancel(endpoint, {
            requestId,
            abortSignal: AbortSignal.timeout(5_000),
          });
        } catch {
          throw new TryOnProviderError(
            "provider_submit_uncertain",
            "Sanal prova sağlayıcıya gönderildi ancak kayıt veya iptal durumu doğrulanamadı. Olası ikinci ücretlendirmeyi önlemek için bu istek yeniden gönderilmeyecek.",
            503,
          );
        }
        throw new TryOnProviderError(
          "provider_cancelled",
          "Sağlayıcı isteği veritabanına kaydedilemedi ve güvenle iptal edildi. Yeni bir prova başlatabilirsin.",
          503,
        );
      }
    }

    let delayMs = 700;
    while (true) {
      const status = await client.queue.status(endpoint, {
        requestId,
        abortSignal: controller.signal,
      });
      if (status.status === "COMPLETED") break;

      await wait(delayMs, controller.signal);
      delayMs = Math.min(Math.round(delayMs * 1.6), 3_000);
    }

    const result = await client.queue.result(endpoint, {
      requestId,
      abortSignal: controller.signal,
    });
    const data = result.data as {
      image?: { url?: unknown };
      images?: Array<{ url?: unknown }>;
      has_nsfw_concepts?: unknown;
    } | null;
    const safetyFlags = data?.has_nsfw_concepts;
    const blockedBySafety = safetyFlags === true
      || (Array.isArray(safetyFlags) && safetyFlags.some((flag) => flag === true));
    if (blockedBySafety) {
      throw new TryOnProviderError(
        "provider_safety",
        endpoint === FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT
          ? "Ürün detayı sonucu sağlayıcının güvenlik filtresine takıldı. Fotoğrafın uygun olsa bile bu yanlış pozitif olabilir; yeni bir üretim için aynı fotoğrafı tekrar seçebilirsin."
          : "Deneysel kalıp sonucu güvenlik filtresine takıldı. Fotoğrafın uygun olsa bile bu yanlış pozitif olabilir; ürün ayrıntısını koruyan Ürün detayı moduyla yeni bir sonuç oluşturabilirsin.",
        422,
      );
    }
    const imageUrl = typeof data?.image?.url === "string"
      ? data.image.url
      : Array.isArray(data?.images) && typeof data.images[0]?.url === "string"
        ? data.images[0].url
        : null;
    if (!imageUrl) {
      throw new TryOnProviderError(
        "provider_output",
        "Sanal prova tamamlandı ancak geçerli bir sonuç görseli alınamadı.",
        502,
      );
    }

    return { requestId, imageUrl };
  } catch (error) {
    // Route katmanından gelen kalıcılık hatasının sağlayıcı hatasına dönüşmesine izin verme.
    if (error instanceof Error && error.name === "RouteError") throw error;
    // Zaman aşımında kuyruk isteğini iptal etmiyoruz. Sağlayıcı tamamladığında aynı
    // requestId ile sonuç alınabilir; böylece istemci yeniden kredi harcatmaz.
    throw mapFalError(controller.signal.aborted ? controller.signal.reason : error);
  } finally {
    clearTimeout(timeout);
  }
}
