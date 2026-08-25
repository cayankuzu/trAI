import { describe, expect, it } from "vitest";
import { isProtectedAppPath } from "./protected-paths";

describe("isProtectedAppPath", () => {
  it.each([
    "/try-on",
    "/looks",
    "/profile",
    "/settings",
    "/support",
    "/change-password",
    "/states/generation-failed",
    "/states/quota-reached",
    "/states/account-deletion",
  ])("%s için erken oturum kontrolü yapar", (pathname) => {
    expect(isProtectedAppPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/legal/privacy",
    "/api/try-ons",
    "/states/session-expired",
    "/states/password-reset-complete",
    "/states/invalid-reset-link",
    "/states/account-deleted",
  ])("%s rotasını Proxy seviyesinde engellemez", (pathname) => {
    expect(isProtectedAppPath(pathname)).toBe(false);
  });
});
