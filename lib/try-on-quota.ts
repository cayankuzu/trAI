export type TryOnQuotaSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  requested: number;
};

function safeCount(value: number | string | null | undefined, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getTryOnQuotaSnapshot(
  usedValue: number | string | null | undefined,
  limitValue: number | string | null | undefined,
  requestedValue: number,
): TryOnQuotaSnapshot {
  const limit = safeCount(limitValue, 5);
  const used = Math.min(limit, safeCount(usedValue, 0));
  const requested = safeCount(requestedValue, 0);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    requested,
  };
}

export function tryOnQuotaExceededMessage(quota: TryOnQuotaSnapshot) {
  if (quota.remaining === 0) {
    return `Bu hesapta bu ay ${quota.used}/${quota.limit} çıktı kullanıldı; yeni çıktı hakkı kalmadı.`;
  }

  return `Bu hesapta bu ay ${quota.used}/${quota.limit} çıktı kullanıldı; ${quota.remaining} kaldı. Seçimin ${quota.requested} çıktı gerektiriyor. Beden veya görünüm sayısını azalt.`;
}
