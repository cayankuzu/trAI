import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../../app/api/try-ons/route.ts", import.meta.url),
  "utf8",
);

describe("fal result recovery route wiring", () => {
  it("records a new provider request before treating it as safely reusable", () => {
    const callbackStart = route.indexOf("onSubmitted: async (nextProviderRequestId)");
    const record = route.indexOf('adminClient.rpc("record_try_on_provider_request"', callbackStart);
    const assignment = route.indexOf("providerRequestId = nextProviderRequestId", record);

    expect(callbackStart).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(callbackStart);
    expect(assignment).toBeGreaterThan(record);
  });

  it("keeps provider output failures retryable and preserves the existing request", () => {
    const retryPolicyStart = route.indexOf("const retrySameRequest =");
    const retryPolicyEnd = route.indexOf("let stateTransitionFailed", retryPolicyStart);
    const retryPolicy = route.slice(retryPolicyStart, retryPolicyEnd);

    expect(route).toContain("resultImage = await downloadFalResultImage(generated.imageUrl)");
    expect(retryPolicy).toContain('"provider_result_unavailable"');
    expect(retryPolicy).not.toContain('"provider_output"');
    expect(route).toContain('adminClient.rpc("record_try_on_retryable_error"');
  });

  it("tamamlanan sonucu giriş dosyası temizliğini beklemeden döndürür", () => {
    const completion = route.indexOf('"complete_try_on_generation"');
    const deferredCleanup = route.indexOf("after(() => removeAndFinalizeTryOnInputs", completion);
    const response = route.indexOf('return NextResponse.json({ data: result, mode: "fal" })', completion);

    expect(completion).toBeGreaterThan(-1);
    expect(deferredCleanup).toBeGreaterThan(completion);
    expect(response).toBeGreaterThan(deferredCleanup);
  });

  it("bir kayıt geçici okunamazsa diğer çoklu sonuçları korur", () => {
    expect(route).toContain("Promise.allSettled(rows.map((row) => completedResult(adminClient, row)))");
    expect(route).toContain("{ data: restored, partial: failedCount > 0 }");
  });
});
