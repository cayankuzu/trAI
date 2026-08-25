import { describe, expect, it } from "vitest";
import {
  clampSplitPercent,
  getAfterClipPath,
  isAlmostEntirelyBlackRgba,
} from "./before-after-slider";

describe("before/after slider geometry", () => {
  it.each([
    [0, "inset(0 0 0 0%)"],
    [50, "inset(0 0 0 50%)"],
    [100, "inset(0 0 0 100%)"],
  ])("keeps the after layer to the right at %s%%", (split, expected) => {
    expect(getAfterClipPath(split)).toBe(expected);
  });

  it.each([
    [-20, 0],
    [0, 0],
    [50, 50],
    [100, 100],
    [140, 100],
  ])("clamps %s to %s", (value, expected) => {
    expect(clampSplitPercent(value)).toBe(expected);
  });

  it("uses the clamped split when building the clip path", () => {
    expect(getAfterClipPath(-1)).toBe("inset(0 0 0 0%)");
    expect(getAfterClipPath(101)).toBe("inset(0 0 0 100%)");
  });

  it("recognizes a fully black decoded image", () => {
    expect(isAlmostEntirelyBlackRgba(new Uint8ClampedArray([
      0, 0, 0, 255,
      1, 1, 1, 255,
    ]))).toBe(true);
  });

  it("does not hide dark clothing on a visible background", () => {
    expect(isAlmostEntirelyBlackRgba(new Uint8ClampedArray([
      2, 2, 2, 255,
      242, 242, 242, 255,
    ]))).toBe(false);
  });

  it("composites transparent pixels over the light result surface", () => {
    expect(isAlmostEntirelyBlackRgba(new Uint8ClampedArray([
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]))).toBe(false);
  });
});
