import { describe, expect, it } from "vitest";
import { resolveAppUrl, resolveBackendMode } from "./config";

describe("resolveBackendMode", () => {
  it("iki Supabase değeri de varsa Supabase modunu seçer", () => {
    expect(resolveBackendMode("production", "https://project.supabase.co", "key"))
      .toBe("supabase");
  });

  it("yalnız geliştirmede ve iki değer de yokken demo modunu seçer", () => {
    expect(resolveBackendMode("development", "", "")).toBe("demo");
    expect(resolveBackendMode("test", "", "")).toBe("demo");
  });

  it("production ortamında eksik yapılandırmayı reddeder", () => {
    expect(resolveBackendMode("production", "", "")).toBe("misconfigured");
    expect(resolveBackendMode("production", "https://project.supabase.co", ""))
      .toBe("misconfigured");
  });

  it("geliştirmede kısmi yapılandırmayı sessizce demoya düşürmez", () => {
    expect(resolveBackendMode("development", "", "key"))
      .toBe("misconfigured");
  });
});

describe("resolveAppUrl", () => {
  it("development için localhost varsayılanını korur", () => {
    expect(resolveAppUrl(undefined, undefined)).toBe("http://localhost:3000");
  });

  it("Vercel production'da eksik veya localhost callback adresini reddeder", () => {
    expect(() => resolveAppUrl(undefined, "production")).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => resolveAppUrl("http://localhost:3001", "production")).toThrow(/HTTPS/);
  });

  it("Vercel production'da gerçek HTTPS alan adını kabul eder", () => {
    expect(resolveAppUrl("https://trai.example/", "production"))
      .toBe("https://trai.example");
  });
});
