import { describe, expect, it } from "vitest";
import { stableTryOnSeed } from "./fal-seed";

describe("stableTryOnSeed", () => {
  it("aynı oturum ve görünüm için kararlı, güvenli bir tamsayı üretir", () => {
    const first = stableTryOnSeed("c5fd83fb-54a0-4e5d-aada-c4b870889b13", "front");
    const second = stableTryOnSeed("c5fd83fb-54a0-4e5d-aada-c4b870889b13", "front");

    expect(first).toBe(second);
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0x7fffffff);
  });

  it("ön ve arka üretimleri birbirinden ayırır", () => {
    const sessionId = "c5fd83fb-54a0-4e5d-aada-c4b870889b13";
    expect(stableTryOnSeed(sessionId, "front")).not.toBe(stableTryOnSeed(sessionId, "back"));
  });
});
