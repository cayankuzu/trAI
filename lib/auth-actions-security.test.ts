import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authActions = readFileSync(
  new URL("../app/auth/actions.ts", import.meta.url),
  "utf8",
);

describe("kimlik doğrulama e-posta hata akışı", () => {
  it("şifre yenileme sağlayıcı hatasını başarı ekranına yönlendirmeden döndürür", () => {
    expect(authActions).toContain(
      "const { error } = await supabase.auth.resetPasswordForEmail",
    );
    expect(authActions).toContain("passwordResetErrorMessage(error)");
  });

  it("doğrulama e-postası yeniden gönderim hatasını da işler", () => {
    expect(authActions).toContain("const { error } = await supabase.auth.resend");
    expect(authActions).toContain("verificationEmailErrorMessage(error)");
  });
});
