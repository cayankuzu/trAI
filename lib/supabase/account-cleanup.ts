const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
const MAX_CLEANUP_PASSES = 3;

type StorageEntry = {
  name: string;
  id: string | null;
};

type StorageError = {
  message: string;
};

export type UserPhotoStorage = {
  list(
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: "name"; order: "asc" };
    },
  ): Promise<{
    data: StorageEntry[] | null;
    error: StorageError | null;
  }>;
  remove(paths: string[]): Promise<{
    error: StorageError | null;
  }>;
};

export class UserPhotoCleanupError extends Error {
  constructor(
    readonly stage: "list" | "remove" | "verify",
    options?: { cause?: unknown },
  ) {
    super(`Kullanıcı fotoğrafları temizlenemedi (${stage}).`, options);
    this.name = "UserPhotoCleanupError";
  }
}

async function collectUserPhotoPaths(
  storage: UserPhotoStorage,
  userId: string,
) {
  const folders = [userId];
  const seenFolders = new Set(folders);
  const paths: string[] = [];

  for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    const folder = folders[folderIndex];

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await storage.list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new UserPhotoCleanupError("list", { cause: error });
      }

      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry.name) continue;
        const entryPath = `${folder}/${entry.name}`;

        if (entry.id === null) {
          if (!seenFolders.has(entryPath)) {
            seenFolders.add(entryPath);
            folders.push(entryPath);
          }
        } else {
          paths.push(entryPath);
        }
      }

      if (entries.length < LIST_PAGE_SIZE) break;
    }
  }

  return paths;
}

export async function removeAllUserPhotos(
  storage: UserPhotoStorage,
  userId: string,
) {
  let removed = 0;

  for (let pass = 0; pass < MAX_CLEANUP_PASSES; pass += 1) {
    const paths = await collectUserPhotoPaths(storage, userId);
    if (paths.length === 0) return removed;

    for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
      const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
      const { error } = await storage.remove(batch);

      if (error) {
        throw new UserPhotoCleanupError("remove", { cause: error });
      }

      removed += batch.length;
    }
  }

  const remaining = await collectUserPhotoPaths(storage, userId);
  if (remaining.length > 0) {
    throw new UserPhotoCleanupError("verify");
  }

  return removed;
}

export function isSupabaseAuthCookieName(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token");
}
