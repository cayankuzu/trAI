import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecoveryProof,
  hasValidRecoveryProof,
} from "./recovery-proof";

const originalSecret = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.SUPABASE_SECRET_KEY;
  } else {
    process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
  vi.restoreAllMocks();
});

describe("password recovery proof", () => {
  it("accepts a valid proof only for the recovery user before expiry", () => {
    process.env.SUPABASE_SECRET_KEY = "test-only-secret";
    const now = 1_000_000;
    const proof = createRecoveryProof("user-a", now);

    expect(proof).toBeTruthy();
    expect(hasValidRecoveryProof(proof ?? undefined, "user-a", now + 1)).toBe(true);
    expect(hasValidRecoveryProof(proof ?? undefined, "user-b", now + 1)).toBe(false);
  });

  it("rejects an altered or expired proof", () => {
    process.env.SUPABASE_SECRET_KEY = "test-only-secret";
    const now = 1_000_000;
    const proof = createRecoveryProof("user-a", now) ?? "";

    expect(hasValidRecoveryProof(`${proof}x`, "user-a", now + 1)).toBe(false);
    expect(hasValidRecoveryProof(proof, "user-a", now + 60 * 60 * 1_000)).toBe(false);
  });

  it("fails closed without the server-only secret", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(createRecoveryProof("user-a")).toBeNull();
    expect(hasValidRecoveryProof("forged", "user-a")).toBe(false);
  });
});
