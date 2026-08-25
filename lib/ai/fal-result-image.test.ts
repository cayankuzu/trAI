import { describe, expect, it, vi } from "vitest";
import { ExternalImageError, type SafeImage } from "../security/external-images";
import {
  downloadFalResultImage,
  FAL_RESULT_DOWNLOAD_RETRY_DELAYS_MS,
} from "./fal-result-image";

const image: SafeImage = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  contentType: "image/jpeg",
  extension: "jpg",
};

describe("downloadFalResultImage", () => {
  it("gecici olarak erisilemeyen ayni sonuc URL'sini sinirli bicimde yeniden indirir", async () => {
    const unavailable = new ExternalImageError("page_unavailable", "not ready");
    const download = vi.fn()
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(image);
    const delay = vi.fn(async (delayMs: number) => {
      void delayMs;
    });

    await expect(downloadFalResultImage("https://v3b.fal.media/result.png", {
      download,
      delay,
    })).resolves.toBe(image);

    expect(download).toHaveBeenCalledTimes(4);
    expect(download).toHaveBeenCalledWith("https://v3b.fal.media/result.png");
    expect(delay.mock.calls.map(([delayMs]) => delayMs))
      .toEqual([...FAL_RESULT_DOWNLOAD_RETRY_DELAYS_MS]);
  });

  it("gecici sonuc hatasini yeniden deneme siniri dolunca aynen firlatir", async () => {
    const unavailable = new ExternalImageError("page_unavailable", "still unavailable");
    const download = vi.fn().mockRejectedValue(unavailable);
    const delay = vi.fn(async (delayMs: number) => {
      void delayMs;
    });

    await expect(downloadFalResultImage("https://v3b.fal.media/result.png", {
      download,
      delay,
      retryDelaysMs: [10],
    })).rejects.toBe(unavailable);

    expect(download).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
  });

  it.each(["invalid_image", "unsafe_url", "image_too_large"] as const)(
    "%s hatasini beklemeden ve yeniden indirmeden iletir",
    async (code) => {
      const permanentError = new ExternalImageError(code, "permanent");
      const download = vi.fn().mockRejectedValue(permanentError);
      const delay = vi.fn(async (delayMs: number) => {
        void delayMs;
      });

      await expect(downloadFalResultImage("https://v3b.fal.media/result.png", {
        download,
        delay,
      })).rejects.toBe(permanentError);

      expect(download).toHaveBeenCalledOnce();
      expect(delay).not.toHaveBeenCalled();
    },
  );
});
