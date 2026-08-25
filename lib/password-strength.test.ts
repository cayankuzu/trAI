import { describe, expect, it } from "vitest";
import { getPasswordStrength } from "./password-strength";

describe("getPasswordStrength", () => {
  it("boş şifreyi başlangıç düzeyinde gösterir", () => {
    expect(getPasswordStrength("")).toMatchObject({ score: 0, label: "Çok zayıf" });
  });

  it("MVP şifre koşulları tamamlandığında iyi düzeyini gösterir", () => {
    expect(getPasswordStrength("guclu123")).toMatchObject({
      score: 3,
      label: "İyi",
      requirements: { length: true, letter: true, number: true },
    });
  });

  it("uzun ve özel karakterli şifreyi güçlü olarak değerlendirir", () => {
    expect(getPasswordStrength("GucluSifre123!")).toMatchObject({
      score: 4,
      label: "Güçlü",
    });
  });
});

