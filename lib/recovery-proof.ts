import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PASSWORD_RECOVERY_MAX_AGE } from "@/lib/auth-cookies";

const RECOVERY_PROOF_VERSION = 1;

type RecoveryProofPayload = {
  v: number;
  userId: string;
  expiresAt: number;
  nonce: string;
};

function getProofSecret() {
  return process.env.SUPABASE_SECRET_KEY?.trim() || null;
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: RecoveryProofPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value: string): RecoveryProofPayload | null {
  try {
    const payload = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RecoveryProofPayload>;

    if (
      payload.v !== RECOVERY_PROOF_VERSION ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      typeof payload.nonce !== "string" ||
      !payload.nonce
    ) {
      return null;
    }

    return payload as RecoveryProofPayload;
  } catch {
    return null;
  }
}

/**
 * Creates a short-lived, server-signed proof that the current Supabase session
 * was established through the password-recovery callback. A plain cookie can
 * be forged by an HTTP client, so the proof is tied to both the user and the
 * server-only Supabase secret key.
 */
export function createRecoveryProof(userId: string, now = Date.now()) {
  const secret = getProofSecret();
  if (!secret || !userId) return null;

  const payload: RecoveryProofPayload = {
    v: RECOVERY_PROOF_VERSION,
    userId,
    expiresAt: now + PASSWORD_RECOVERY_MAX_AGE * 1_000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function hasValidRecoveryProof(
  value: string | undefined,
  userId: string,
  now = Date.now(),
) {
  const secret = getProofSecret();
  if (!secret || !value || !userId) return false;

  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) return false;

  const encodedPayload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);
  const suppliedBytes = Buffer.from(suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return false;
  }

  const payload = decodePayload(encodedPayload);
  return Boolean(
    payload &&
    payload.userId === userId &&
    payload.expiresAt > now,
  );
}
