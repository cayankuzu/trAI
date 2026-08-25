import { describe, expect, it } from "vitest";
import { readBoundedJson } from "./read-json-body";

describe("readBoundedJson", () => {
  it("parses JSON below the byte limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ size: "M" }),
    });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({
      ok: true,
      value: { size: "M" },
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/test", { method: "POST", body: "{" });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("stops an undeclared-length body at the streamed byte limit", async () => {
    const request = new Request("http://localhost/test", { method: "POST", body: "123456789" });
    request.headers.delete("content-length");
    await expect(readBoundedJson(request, 8)).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects an oversized declared body before reading it", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "{}",
    });
    await expect(readBoundedJson(request, 8)).resolves.toEqual({ ok: false, reason: "too_large" });
  });
});
