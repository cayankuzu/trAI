import type { TryOnView } from "@/lib/types";

/**
 * Uses one deterministic seed per session/view so size variants begin from the
 * same composition. This is a consistency aid, not a physical-fit guarantee.
 */
export function stableTryOnSeed(sessionId: string, view: TryOnView) {
  const value = `${sessionId}:${view}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1;
}
