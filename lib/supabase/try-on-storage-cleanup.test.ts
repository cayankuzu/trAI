import { describe, expect, it, vi } from "vitest";
import {
  isOwnedTryOnStoragePath,
  removeAndFinalizeTryOnStorageCleanup,
  removeOwnedTryOnStoragePaths,
  type TryOnStorageCleanupDependencies,
} from "./try-on-storage-cleanup";

const userId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";

function createDependencies(): TryOnStorageCleanupDependencies & {
  remove: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
} {
  return {
    remove: vi.fn(async () => ({ error: null })),
    finalize: vi.fn(async () => ({ data: true, error: null })),
  };
}

describe("try-on Storage cleanup", () => {
  it("yalnızca aynı kullanıcı ve prova isteğine ait kesin yolları kabul eder", () => {
    expect(isOwnedTryOnStoragePath(`${userId}/${requestId}/person.jpg`, userId, requestId)).toBe(true);
    expect(isOwnedTryOnStoragePath(`${userId}/${requestId}/garment-upload.webp`, userId, requestId)).toBe(true);
    expect(isOwnedTryOnStoragePath(`${userId}/${requestId}/result.png`, userId, requestId)).toBe(true);
    expect(isOwnedTryOnStoragePath(`${userId}/other/result.png`, userId, requestId)).toBe(false);
    expect(isOwnedTryOnStoragePath(`${userId}/${requestId}/result.svg`, userId, requestId)).toBe(false);
  });

  it("geçersiz bir yol varsa hiçbir dosyayı silmez ve finalize çağırmaz", async () => {
    const dependencies = createDependencies();

    await expect(removeAndFinalizeTryOnStorageCleanup(dependencies, {
      userId,
      requestId,
      paths: [
        `${userId}/${requestId}/person.jpg`,
        `${userId}/another-request/person.jpg`,
      ],
    })).resolves.toEqual({ ok: false, stage: "validation" });

    expect(dependencies.remove).not.toHaveBeenCalled();
    expect(dependencies.finalize).not.toHaveBeenCalled();
  });

  it("Storage silme başarısızsa DB yollarını temizlemez", async () => {
    const dependencies = createDependencies();
    dependencies.remove.mockResolvedValueOnce({ error: { message: "storage unavailable" } });

    await expect(removeAndFinalizeTryOnStorageCleanup(dependencies, {
      userId,
      requestId,
      paths: [`${userId}/${requestId}/person.webp`],
    })).resolves.toMatchObject({ ok: false, stage: "remove" });

    expect(dependencies.finalize).not.toHaveBeenCalled();
  });

  it("başarılı silmeden sonra cleanup RPC'sini tam bir kez çağırır", async () => {
    const dependencies = createDependencies();
    const personPath = `${userId}/${requestId}/person.jpg`;
    const garmentPath = `${userId}/${requestId}/garment-og.png`;

    await expect(removeAndFinalizeTryOnStorageCleanup(dependencies, {
      userId,
      requestId,
      paths: [personPath, garmentPath, personPath],
    })).resolves.toEqual({ ok: true, paths: [personPath, garmentPath] });

    expect(dependencies.remove).toHaveBeenCalledWith([personPath, garmentPath]);
    expect(dependencies.finalize).toHaveBeenCalledWith({ userId, requestId });
  });

  it("retry sırasında yalnız sonuç dosyasını finalize etmeden silebilir", async () => {
    const dependencies = createDependencies();
    const resultPath = `${userId}/${requestId}/result.webp`;

    await expect(removeOwnedTryOnStoragePaths(dependencies, {
      userId,
      requestId,
      paths: [resultPath],
    })).resolves.toEqual({ ok: true, paths: [resultPath] });

    expect(dependencies.remove).toHaveBeenCalledWith([resultPath]);
    expect(dependencies.finalize).not.toHaveBeenCalled();
  });
});
