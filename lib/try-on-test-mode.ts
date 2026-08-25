import "server-only";

export const NORMAL_TRY_ON_BATCH_LIMIT = 5;
export const TEST_TRY_ON_BATCH_LIMIT = 18;

export function isTryOnUnlimitedTestMode() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL_ENV) return false;
  return process.env.TRY_ON_UNLIMITED_TEST_MODE?.trim().toLowerCase() === "true";
}
