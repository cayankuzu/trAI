export function maskEmail(email: string | undefined) {
  if (!email) return null;

  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex <= 0) return null;

  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);
  const visibleStart = localPart.slice(0, Math.min(2, localPart.length));
  const hiddenLength = Math.max(3, localPart.length - visibleStart.length);

  return `${visibleStart}${"•".repeat(hiddenLength)}@${domain}`;
}

