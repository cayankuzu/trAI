import { afterEach, describe, expect, it, vi } from "vitest";
import { FalSubmitUncertainError } from "./fal-errors";
import {
  FAL_FIT_AWARE_TRY_ON_ENDPOINT,
  FAL_LEGACY_TRY_ON_ENDPOINT,
  FAL_PRIMARY_TRY_ON_ENDPOINT,
} from "./fal-endpoints";
import { submitFalTryOnOnce, type FalSubmitInput } from "./fal-submit";

const submitInput: FalSubmitInput = {
  endpoint: FAL_PRIMARY_TRY_ON_ENDPOINT,
  personImageUrl: "https://storage.example/person.jpg",
  clothingImageUrl: "https://storage.example/garment.jpg",
  garmentCategory: "tops",
  garmentPhotoType: "flat-lay",
  prompt: "Create a photorealistic regular-fit virtual try-on.",
  seed: 123456,
  abortSignal: new AbortController().signal,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitFalTryOnOnce", () => {
  it("varsayılan modeli ürün ayrıntısı öncelikli FASHN kalite şemasıyla gönderir", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ request_id: "fal-request-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitFalTryOnOnce("server-secret", submitInput))
      .resolves.toBe("fal-request-1");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://queue.fal.run/fal-ai/fashn/tryon/v1.6");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Key server-secret",
      "X-Fal-Store-IO": "0",
      "X-Fal-Request-Timeout": "45",
      "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
        expiration_duration_seconds: 600,
      }),
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model_image: submitInput.personImageUrl,
      garment_image: submitInput.clothingImageUrl,
      category: "tops",
      mode: "quality",
      garment_photo_type: "flat-lay",
      moderation_level: "permissive",
      seed: 123456,
      num_samples: 1,
      segmentation_free: true,
      output_format: "png",
    });
  });

  it("açık beta beden görünümünü prompt ve sabit çekirdekle FLUX 2'ye gönderir", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ request_id: "fashn-request-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitFalTryOnOnce("server-secret", {
      ...submitInput,
      endpoint: FAL_FIT_AWARE_TRY_ON_ENDPOINT,
    })).resolves.toBe("fashn-request-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://queue.fal.run/fal-ai/flux-2-lora-gallery/virtual-tryon");
    expect(JSON.parse(String(init.body))).toEqual({
      image_urls: [submitInput.personImageUrl, submitInput.clothingImageUrl],
      prompt: submitInput.prompt,
      image_size: { width: 864, height: 1296 },
      guidance_scale: 2.5,
      num_inference_steps: 40,
      acceleration: "regular",
      seed: 123456,
      enable_safety_checker: true,
      output_format: "png",
      num_images: 1,
      lora_scale: 1,
    });
  });

  it("mevcut DB işleri için legacy FLUX gövdesini doğru endpoint'e gönderir", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ request_id: "fashn-request-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitFalTryOnOnce("server-secret", {
      ...submitInput,
      endpoint: FAL_LEGACY_TRY_ON_ENDPOINT,
    })).resolves.toBe("fashn-request-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://queue.fal.run/fal-ai/flux-pro/v1/vto");
    expect(JSON.parse(String(init.body))).toEqual({
      prompt: submitInput.prompt,
      human_image_url: submitInput.personImageUrl,
      garment_image_url: submitInput.clothingImageUrl,
      output_format: "jpeg",
    });
    expect(String(init.body)).not.toContain("model_image");
  });

  it("belirsiz ağ hatasında POST isteğini yeniden denemez", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitFalTryOnOnce("server-secret", submitInput))
      .rejects.toBeInstanceOf(FalSubmitUncertainError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("başarılı fakat kimliksiz yanıtı belirsiz submit olarak kapatır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({}),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    await expect(submitFalTryOnOnce("server-secret", submitInput))
      .rejects.toBeInstanceOf(FalSubmitUncertainError);
  });

  it("treats an aborted submit POST as uncertain", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("timeout", "AbortError"));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw controller.signal.reason;
    }));

    await expect(submitFalTryOnOnce("server-secret", {
      ...submitInput,
      abortSignal: controller.signal,
    })).rejects.toBeInstanceOf(FalSubmitUncertainError);
  });
});
