const PROTECTED_APP_PATHS = new Set([
  "/try-on",
  "/looks",
  "/profile",
  "/settings",
  "/support",
  "/change-password",
  "/states/catalog-unavailable",
  "/states/photo-upload-failed",
  "/states/photo-quality",
  "/states/generation-failed",
  "/states/generation-timeout",
  "/states/offline",
  "/states/quota-reached",
  "/states/empty-looks",
  "/states/account-deletion",
]);

export function isProtectedAppPath(pathname: string) {
  return PROTECTED_APP_PATHS.has(pathname);
}
