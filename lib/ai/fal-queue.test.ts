import type { FalClient, QueueStatus } from "@fal-ai/client";
import { describe, expect, it, vi } from "vitest";
import {
  FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
  FAL_LEGACY_TRY_ON_ENDPOINT,
  FAL_PRIMARY_TRY_ON_ENDPOINT,
} from "./fal-endpoints";
import { runFalQueue } from "./fal-queue";

function queueStatus(status: QueueStatus["status"]): QueueStatus {
  return {
    status,
    request_id: "fal-request-1",
    response_url: "https://queue.fal.run/result",
    status_url: "https://queue.fal.run/status",
    cancel_url: "https://queue.fal.run/cancel",
    ...(status === "IN_QUEUE" ? { queue_position: 0 } : { logs: [] }),
  } as QueueStatus;
}

describe("runFalQueue", () => {
  it("varsayılan beden yönlendirmeli kuyruğa bir kez gönderip sonucu döndürür", async () => {
    const onSubmitted = vi.fn(async () => undefined);
    const submit = vi.fn(async () => "fal-request-1");
    const status = vi.fn(async () => queueStatus("COMPLETED"));
    const result = vi.fn(async () => ({
      requestId: "fal-request-1",
      data: { images: [{ url: "https://cdn.fashn.ai/result.png" }] },
    }));
    const client = { queue: { status, result } } as unknown as FalClient;

    await expect(runFalQueue(client, {
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      fit: {
        productTitle: "Spider-Man T-shirt",
        category: "Tops",
        selectedSize: "L",
        view: "front",
        fitIntent: "regular",
      },
      onSubmitted,
    }, submit)).resolves.toEqual({ requestId: "fal-request-1", imageUrl: "https://cdn.fashn.ai/result.png" });

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: FAL_PRIMARY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      prompt: expect.stringContaining("selected catalog size: L"),
      abortSignal: expect.any(AbortSignal),
    }));
    expect(onSubmitted).toHaveBeenCalledWith("fal-request-1");
  });

  it("geçiş sürecinde legacy images dizisi çıktısını da kabul eder", async () => {
    const client = {
      queue: {
        status: vi.fn(async () => queueStatus("COMPLETED")),
        result: vi.fn(async () => ({
          requestId: "legacy-request",
          data: { images: [{ url: "https://v3.fal.media/legacy-result.jpg" }] },
        })),
      },
    } as unknown as FalClient;

    await expect(runFalQueue(client, {
      endpoint: FAL_LEGACY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      existingRequestId: "legacy-request",
    }, vi.fn())).resolves.toEqual({
      requestId: "legacy-request",
      imageUrl: "https://v3.fal.media/legacy-result.jpg",
    });
    expect(client.queue.status).toHaveBeenCalledWith(
      FAL_LEGACY_TRY_ON_ENDPOINT,
      expect.objectContaining({ requestId: "legacy-request" }),
    );
    expect(client.queue.result).toHaveBeenCalledWith(
      FAL_LEGACY_TRY_ON_ENDPOINT,
      expect.objectContaining({ requestId: "legacy-request" }),
    );
  });

  it("açıkça seçilen FASHN endpoint'ini submit, durum ve sonuç boyunca korur", async () => {
    const submit = vi.fn(async () => "fashn-request-1");
    const status = vi.fn(async () => queueStatus("COMPLETED"));
    const result = vi.fn(async () => ({
      requestId: "fashn-request-1",
      data: { images: [{ url: "https://cdn.fashn.ai/result.png" }] },
    }));
    const client = { queue: { status, result } } as unknown as FalClient;

    await expect(runFalQueue(client, {
      endpoint: FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      garmentCategory: "bottoms",
    }, submit)).resolves.toEqual({
      requestId: "fashn-request-1",
      imageUrl: "https://cdn.fashn.ai/result.png",
    });

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
      garmentCategory: "bottoms",
    }));
    expect(status).toHaveBeenCalledWith(
      FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
      expect.objectContaining({ requestId: "fashn-request-1" }),
    );
    expect(result).toHaveBeenCalledWith(
      FAL_GARMENT_FIDELITY_TRY_ON_ENDPOINT,
      expect.objectContaining({ requestId: "fashn-request-1" }),
    );
  });

  it("var olan sağlayıcı isteğini yeniden göndermeden devam ettirir", async () => {
    const submit = vi.fn(async () => "unexpected-request");
    const client = {
      queue: {
        status: vi.fn(async () => queueStatus("COMPLETED")),
        result: vi.fn(async () => ({
          requestId: "existing-request",
          data: { images: [{ url: "https://v3.fal.media/result.jpg" }] },
        })),
      },
    } as unknown as FalClient;

    await runFalQueue(client, {
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      existingRequestId: "existing-request",
    }, submit);

    expect(submit).not.toHaveBeenCalled();
  });

  it("sınırlı bekleme süresi dolduğunda güvenli zaman aşımı hatası verir", async () => {
    const submit = vi.fn(async () => "fal-request-1");
    const client = {
      queue: {
        status: vi.fn(async (_endpoint: string, options: { abortSignal?: AbortSignal }) => new Promise((_, reject) => {
          options.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason), { once: true });
        })),
      },
    } as unknown as FalClient;

    await expect(runFalQueue(client, {
      endpoint: FAL_PRIMARY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      timeoutMs: 10,
    }, submit)).rejects.toMatchObject({ code: "provider_timeout", status: 504 });
  });

  it("kuyruk kimliği kalıcılaştırılamazsa isteği iptal edip hatayı değiştirmeden iletir", async () => {
    const persistenceError = Object.assign(new Error("database unavailable"), { name: "RouteError" });
    const cancel = vi.fn(async () => undefined);
    const client = {
      queue: {
        cancel,
      },
    } as unknown as FalClient;
    const submit = vi.fn(async () => "fal-request-1");

    await expect(runFalQueue(client, {
      endpoint: FAL_PRIMARY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      onSubmitted: async () => { throw persistenceError; },
    }, submit)).rejects.toMatchObject({ code: "provider_cancelled", status: 503 });
    expect(cancel).toHaveBeenCalledWith(
      FAL_PRIMARY_TRY_ON_ENDPOINT,
      expect.objectContaining({ requestId: "fal-request-1" }),
    );
  });

  it("rejects provider output when the safety flag is true", async () => {
    const client = {
      queue: {
        status: vi.fn(async () => queueStatus("COMPLETED")),
        result: vi.fn(async () => ({
          requestId: "safety-blocked-request",
          data: {
            images: [{ url: "https://v3.fal.media/blocked-result.jpg" }],
            has_nsfw_concepts: [true],
          },
        })),
      },
    } as unknown as FalClient;

    const promise = runFalQueue(client, {
      endpoint: FAL_LEGACY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      existingRequestId: "safety-blocked-request",
    }, vi.fn());

    await expect(promise).rejects.toMatchObject({
      code: "provider_safety",
      status: 422,
      message: expect.stringContaining("Ürün detayı moduyla"),
    });
  });

  it("accepts provider output when the safety flag is false", async () => {
    const client = {
      queue: {
        status: vi.fn(async () => queueStatus("COMPLETED")),
        result: vi.fn(async () => ({
          requestId: "safety-approved-request",
          data: {
            images: [{ url: "https://v3.fal.media/approved-result.jpg" }],
            has_nsfw_concepts: [false],
          },
        })),
      },
    } as unknown as FalClient;

    await expect(runFalQueue(client, {
      endpoint: FAL_LEGACY_TRY_ON_ENDPOINT,
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      existingRequestId: "safety-approved-request",
    }, vi.fn())).resolves.toEqual({
      requestId: "safety-approved-request",
      imageUrl: "https://v3.fal.media/approved-result.jpg",
    });
  });

  it("marks the submit as uncertain when provider cancellation cannot be confirmed", async () => {
    const persistenceError = Object.assign(new Error("database unavailable"), { name: "RouteError" });
    const cancel = vi.fn(async () => { throw new Error("cancel unavailable"); });
    const client = { queue: { cancel } } as unknown as FalClient;

    await expect(runFalQueue(client, {
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
      onSubmitted: async () => { throw persistenceError; },
    }, vi.fn(async () => "fal-request-1"))).rejects.toMatchObject({
      code: "provider_submit_uncertain",
      status: 503,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bozuk provider çıktısını kontrollü terminal hataya çevirir", async () => {
    const client = {
      queue: {
        status: vi.fn(async () => queueStatus("COMPLETED")),
        result: vi.fn(async () => ({ requestId: "fal-request-1", data: {} })),
      },
    } as unknown as FalClient;

    await expect(runFalQueue(client, {
      personImageUrl: "https://storage.example/person.jpg",
      clothingImageUrl: "https://storage.example/garment.jpg",
    }, vi.fn(async () => "fal-request-1"))).rejects.toMatchObject({
      code: "provider_output",
      status: 502,
    });
  });
});
