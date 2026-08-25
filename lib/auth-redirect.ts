const AUTH_CONFIRM_DESTINATIONS = new Set(["/email-verified", "/reset-password"]);

export function getSafeAuthConfirmDestination(requestedNext: string | null) {
  return requestedNext && AUTH_CONFIRM_DESTINATIONS.has(requestedNext)
    ? requestedNext
    : "/email-verified";
}

export function getAuthConfirmFailureDestination(requestedNext: string | null) {
  return requestedNext === "/reset-password"
    ? "/reset-password/invalid"
    : "/email-verification-failed";
}
