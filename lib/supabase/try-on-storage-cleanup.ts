const TRY_ON_IMAGE_EXTENSIONS = ["jpg", "png", "webp"] as const;
const TRY_ON_IMAGE_KINDS = ["person", "garment-upload", "garment-og", "result"] as const;

type StorageCleanupError = unknown;

export type TryOnStorageCleanupDependencies = {
  remove(paths: string[]): Promise<{ error: StorageCleanupError | null }>;
  finalize(input: {
    userId: string;
    requestId: string;
  }): Promise<{ data: unknown; error: StorageCleanupError | null }>;
};

export type TryOnStorageRemovalDependencies = Pick<TryOnStorageCleanupDependencies, "remove">;

export type TryOnStorageCleanupResult =
  | { ok: true; paths: string[] }
  | {
    ok: false;
    stage: "validation" | "remove" | "finalize";
    error?: StorageCleanupError;
  };

function allowedTryOnPaths(userId: string, requestId: string) {
  return new Set(
    TRY_ON_IMAGE_KINDS.flatMap((kind) =>
      TRY_ON_IMAGE_EXTENSIONS.map((extension) => `${userId}/${requestId}/${kind}.${extension}`),
    ),
  );
}

export function isOwnedTryOnStoragePath(
  path: string,
  userId: string,
  requestId: string,
) {
  return allowedTryOnPaths(userId, requestId).has(path);
}

export async function removeOwnedTryOnStoragePaths(
  dependencies: TryOnStorageRemovalDependencies,
  input: {
    userId: string;
    requestId: string;
    paths: Iterable<string>;
  },
): Promise<TryOnStorageCleanupResult> {
  const paths = [...new Set(input.paths)];
  const allowedPaths = allowedTryOnPaths(input.userId, input.requestId);

  if (paths.length === 0 || paths.some((path) => !allowedPaths.has(path))) {
    return { ok: false, stage: "validation" };
  }

  try {
    const { error } = await dependencies.remove(paths);
    if (error) return { ok: false, stage: "remove", error };
  } catch (error) {
    return { ok: false, stage: "remove", error };
  }

  return { ok: true, paths };
}

export async function removeAndFinalizeTryOnStorageCleanup(
  dependencies: TryOnStorageCleanupDependencies,
  input: {
    userId: string;
    requestId: string;
    paths: Iterable<string>;
  },
): Promise<TryOnStorageCleanupResult> {
  const removal = await removeOwnedTryOnStoragePaths(dependencies, input);
  if (!removal.ok) return removal;

  try {
    const { data, error } = await dependencies.finalize({
      userId: input.userId,
      requestId: input.requestId,
    });
    if (error || data !== true) {
      return { ok: false, stage: "finalize", error: error ?? undefined };
    }
  } catch (error) {
    return { ok: false, stage: "finalize", error };
  }

  return removal;
}
