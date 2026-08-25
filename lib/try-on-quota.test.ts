import { describe, expect, it } from "vitest";
import { getTryOnQuotaSnapshot, tryOnQuotaExceededMessage } from "@/lib/try-on-quota";

describe("try-on quota feedback", () => {
  it("explains when the selected variants exceed the remaining quota", () => {
    const quota = getTryOnQuotaSnapshot("4", 5, 2);

    expect(quota).toEqual({ used: 4, limit: 5, remaining: 1, requested: 2 });
    expect(tryOnQuotaExceededMessage(quota)).toBe(
      "Bu hesapta bu ay 4/5 çıktı kullanıldı; 1 kaldı. Seçimin 2 çıktı gerektiriyor. Beden veya görünüm sayısını azalt.",
    );
  });

  it("reports a fully consumed quota without negative remaining values", () => {
    const quota = getTryOnQuotaSnapshot(8, "5", 1);

    expect(quota).toEqual({ used: 5, limit: 5, remaining: 0, requested: 1 });
    expect(tryOnQuotaExceededMessage(quota)).toBe(
      "Bu hesapta bu ay 5/5 çıktı kullanıldı; yeni çıktı hakkı kalmadı.",
    );
  });

  it("uses safe defaults for malformed database counts", () => {
    expect(getTryOnQuotaSnapshot("not-a-number", null, -3)).toEqual({
      used: 0,
      limit: 5,
      remaining: 5,
      requested: 0,
    });
  });
});
