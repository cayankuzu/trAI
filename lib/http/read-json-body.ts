export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid" | "too_large" };

function declaredBodyLength(request: Request) {
  const header = request.headers.get("content-length");
  if (header === null || header.trim() === "") return null;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Reads JSON while enforcing the byte limit as the request stream is consumed. */
export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<BoundedJsonResult> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError("maximumBytes must be a positive safe integer");
  }

  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    await request.body?.cancel("request body too large").catch(() => undefined);
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: false, reason: "invalid" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    await reader.cancel("invalid request body").catch(() => undefined);
    return { ok: false, reason: "invalid" };
  } finally {
    reader.releaseLock();
  }

  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
