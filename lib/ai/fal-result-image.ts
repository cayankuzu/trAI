import {
  downloadExternalImage,
  ExternalImageError,
  type SafeImage,
} from "../security/external-images";

export const FAL_RESULT_DOWNLOAD_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const;
const FAL_RESULT_DOWNLOAD_TIMEOUT_MS = 4_000;

type FalResultImageDownloader = (url: string) => Promise<SafeImage>;
type Delay = (delayMs: number) => Promise<void>;

type FalResultImageRetryOptions = {
  download?: FalResultImageDownloader;
  delay?: Delay;
  retryDelaysMs?: readonly number[];
};

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retries only a temporarily unavailable fal.ai result URL. The provider job is
 * never submitted again, so recovery cannot consume another generation credit.
 */
export async function downloadFalResultImage(
  url: string,
  options: FalResultImageRetryOptions = {},
): Promise<SafeImage> {
  const download = options.download ?? ((value) => downloadExternalImage(value, {
    timeoutMs: FAL_RESULT_DOWNLOAD_TIMEOUT_MS,
  }));
  const delay = options.delay ?? wait;
  const retryDelaysMs = options.retryDelaysMs ?? FAL_RESULT_DOWNLOAD_RETRY_DELAYS_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await download(url);
    } catch (error) {
      const canRetry = error instanceof ExternalImageError
        && error.code === "page_unavailable"
        && attempt < retryDelaysMs.length;
      if (!canRetry) throw error;

      await delay(retryDelaysMs[attempt]);
    }
  }
}
