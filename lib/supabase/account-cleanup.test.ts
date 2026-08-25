import { describe, expect, it } from "vitest";
import {
  isSupabaseAuthCookieName,
  removeAllUserPhotos,
  UserPhotoCleanupError,
  type UserPhotoStorage,
} from "./account-cleanup";

function createStorage(initialPaths: string[]) {
  const objects = new Set(initialPaths);
  const removedBatches: string[][] = [];

  const storage: UserPhotoStorage = {
    async list(path, options) {
      const prefix = `${path}/`;
      const children = new Map<string, { name: string; id: string | null }>();

      for (const objectPath of objects) {
        if (!objectPath.startsWith(prefix)) continue;
        const remainder = objectPath.slice(prefix.length);
        const [name, ...rest] = remainder.split("/");
        if (!name) continue;
        children.set(name, { name, id: rest.length > 0 ? null : objectPath });
      }

      const page = [...children.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(options.offset, options.offset + options.limit);

      return { data: page, error: null };
    },
    async remove(paths) {
      removedBatches.push([...paths]);
      for (const path of paths) objects.delete(path);
      return { error: null };
    },
  };

  return { storage, objects, removedBatches };
}

describe("removeAllUserPhotos", () => {
  it("100 sınırını aşan klasörleri sayfalayıp gruplar halinde siler", async () => {
    const userId = "user-1";
    const paths = Array.from(
      { length: 225 },
      (_, index) => `${userId}/try-on-${String(index).padStart(3, "0")}/source.jpg`,
    );
    const { storage, objects, removedBatches } = createStorage(paths);

    await expect(removeAllUserPhotos(storage, userId)).resolves.toBe(225);
    expect(objects.size).toBe(0);
    expect(removedBatches.map((batch) => batch.length)).toEqual([100, 100, 25]);
  });

  it("tekrar çalıştırıldığında güvenli biçimde işlem yapmadan tamamlanır", async () => {
    const { storage } = createStorage(["user-1/a/source.jpg"]);

    await expect(removeAllUserPhotos(storage, "user-1")).resolves.toBe(1);
    await expect(removeAllUserPhotos(storage, "user-1")).resolves.toBe(0);
  });

  it("Storage silme hatasını hesap silmeye geçmeden bildirir", async () => {
    const { storage } = createStorage(["user-1/a/source.jpg"]);
    storage.remove = async () => ({ error: { message: "storage unavailable" } });

    await expect(removeAllUserPhotos(storage, "user-1")).rejects.toMatchObject({
      name: "UserPhotoCleanupError",
      stage: "remove",
    } satisfies Partial<UserPhotoCleanupError>);
  });
});

describe("isSupabaseAuthCookieName", () => {
  it("Supabase auth cookie ve parçalarını tanır", () => {
    expect(isSupabaseAuthCookieName("sb-project-auth-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-project-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookieName("trai-demo-session")).toBe(false);
  });
});
