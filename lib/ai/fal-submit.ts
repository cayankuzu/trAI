import { ApiError } from "@fal-ai/client";
import { FalSubmitUncertainError } from "./fal-errors";
import {
  FAL_FIT_AWARE_TRY_ON_ENDPOINT,
  FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
  FAL_LEGACY_TRY_ON_ENDPOINT,
  type FalTryOnEndpoint,
  type FashnGarmentCategory,
  type FashnGarmentPhotoType,
} from "./fal-endpoints";

const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const FAL_START_TIMEOUT_SECONDS = 45;
const FAL_OUTPUT_TTL_SECONDS = 10 * 60;

export type FalSubmitInput = {
  endpoint: FalTryOnEndpoint;
  personImageUrl: string;
  clothingImageUrl: string;
  garmentCategory?: FashnGarmentCategory;
  garmentPhotoType?: FashnGarmentPhotoType;
  prompt: string;
  seed?: number;
  abortSignal: AbortSignal;
};

type FalQueueResponse = {
  request_id?: unknown;
};

function messageFromBody(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const candidate = body as { message?: unknown; detail?: unknown };
  if (typeof candidate.message === "string") return candidate.message;
  if (typeof candidate.detail === "string") return candidate.detail;
  return fallback;
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null) as Promise<unknown>;
}

export function falTryOnSubmitBody(input: FalSubmitInput) {
  if (input.endpoint === FAL_FIT_AWARE_TRY_ON_ENDPOINT) {
    return {
      image_urls: [input.personImageUrl, input.clothingImageUrl],
      prompt: input.prompt,
      image_size: { width: 864, height: 1296 },
      guidance_scale: 2.5,
      num_inference_steps: 40,
      acceleration: "regular",
      ...(input.seed === undefined ? {} : { seed: input.seed }),
      enable_safety_checker: true,
      output_format: "png",
      num_images: 1,
      lora_scale: 1,
    } as const;
  }

  if (input.endpoint === FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT) {
    return {
      model_image: input.personImageUrl,
      garment_image: input.clothingImageUrl,
      category: input.garmentCategory ?? "auto",
      mode: "quality",
      garment_photo_type: input.garmentPhotoType ?? "auto",
      moderation_level: "permissive",
      ...(input.seed === undefined ? {} : { seed: input.seed }),
      num_samples: 1,
      segmentation_free: true,
      output_format: "png",
    } as const;
  }

  if (input.endpoint === FAL_LEGACY_TRY_ON_ENDPOINT) {
    return {
      prompt: input.prompt,
      human_image_url: input.personImageUrl,
      garment_image_url: input.clothingImageUrl,
      output_format: "jpeg",
    } as const;
  }

  const unsupportedEndpoint: never = input.endpoint;
  throw new Error(`Unsupported fal.ai endpoint: ${unsupportedEndpoint}`);
}

/**
 * Queue submission is intentionally sent exactly once. A retryable GET can be
 * repeated safely, but retrying an ambiguous POST could create another paid
 * provider request with a different fal request_id.
 */
export async function submitFalTryOnOnce(
  key: string,
  input: FalSubmitInput,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${FAL_QUEUE_ORIGIN}/${input.endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        "X-Fal-Store-IO": "0",
        "X-Fal-Request-Timeout": String(FAL_START_TIMEOUT_SECONDS),
        "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
          expiration_duration_seconds: FAL_OUTPUT_TTL_SECONDS,
        }),
      },
      body: JSON.stringify(falTryOnSubmitBody(input)),
      cache: "no-store",
      redirect: "error",
      signal: input.abortSignal,
    });
  } catch {
    // Abort sırasında da sağlayıcı POST'u kabul etmiş, fakat request_id yanıtı
    // ulaşmamış olabilir. İkinci ücretli işi önlemek için her submit bağlantı
    // hatası belirsiz ve terminal kabul edilir.
    throw new FalSubmitUncertainError();
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new ApiError({
      message: messageFromBody(body, response.statusText || "fal.ai queue error"),
      status: response.status,
      body,
      requestId: response.headers.get("x-fal-request-id") ?? undefined,
      timeoutType: response.headers.get("x-fal-request-timeout-type") ?? undefined,
    });
  }

  const requestId = (body as FalQueueResponse | null)?.request_id;
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new FalSubmitUncertainError();
  }
  return requestId;
}
