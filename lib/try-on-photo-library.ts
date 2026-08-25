const PHOTO_LIBRARY_DATABASE = "trai-private-photo-library";
const PHOTO_LIBRARY_STORE = "photos";
const PHOTO_LIBRARY_DATABASE_VERSION = 1;

export const TRY_ON_PHOTO_LIBRARY_LIMIT = 12;

type StoredTryOnPhoto = {
  key: string;
  id: string;
  userId: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt: number;
  lastUsedAt: number;
};

export type TryOnPhotoLibraryEntry = {
  id: string;
  file: File;
  createdAt: number;
  lastUsedAt: number;
};

export type TryOnPhotoLibrarySummary = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  lastUsedAt: number;
  previewUrl: string;
};

type StorePhotoOptions = {
  id?: string;
  preserveIds?: Iterable<string>;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Fotoğraf arşivi okunamadı.")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Fotoğraf arşivi işlemi iptal edildi.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Fotoğraf arşivi güncellenemedi.")), { once: true });
  });
}

function openPhotoLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Bu tarayıcı yerel fotoğraf arşivini desteklemiyor."));
      return;
    }

    const request = indexedDB.open(PHOTO_LIBRARY_DATABASE, PHOTO_LIBRARY_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (database.objectStoreNames.contains(PHOTO_LIBRARY_STORE)) return;
      const store = database.createObjectStore(PHOTO_LIBRARY_STORE, { keyPath: "key" });
      store.createIndex("by-user", "userId", { unique: false });
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Fotoğraf arşivi açılamadı.")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Fotoğraf arşivi başka bir sekme tarafından kullanılıyor.")), { once: true });
  });
}

export function tryOnPhotoStorageKey(userId: string, photoId: string) {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(photoId)}`;
}

function isStoredTryOnPhoto(value: unknown): value is StoredTryOnPhoto {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredTryOnPhoto>;
  return typeof record.key === "string"
    && typeof record.id === "string"
    && typeof record.userId === "string"
    && record.blob instanceof Blob
    && typeof record.name === "string"
    && typeof record.type === "string"
    && typeof record.size === "number"
    && typeof record.lastModified === "number"
    && typeof record.createdAt === "number"
    && typeof record.lastUsedAt === "number";
}

function asFile(record: StoredTryOnPhoto) {
  return new File([record.blob], record.name || "prova-fotografi", {
    type: record.type || record.blob.type,
    lastModified: record.lastModified,
  });
}

async function recordsForUser(database: IDBDatabase, userId: string) {
  const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readonly");
  const done = transactionDone(transaction);
  const index = transaction.objectStore(PHOTO_LIBRARY_STORE).index("by-user");
  const values = await requestResult(index.getAll(IDBKeyRange.only(userId)));
  await done;
  return values.filter(isStoredTryOnPhoto);
}

async function trimPhotoLibrary(
  database: IDBDatabase,
  userId: string,
  preserveIds: Iterable<string> = [],
) {
  const records = (await recordsForUser(database, userId))
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt || right.createdAt - left.createdAt);
  if (records.length <= TRY_ON_PHOTO_LIBRARY_LIMIT) return;

  const protectedIds = new Set(preserveIds);
  const removable = records
    .slice()
    .reverse()
    .filter((record) => !protectedIds.has(record.id));
  const removeCount = Math.min(records.length - TRY_ON_PHOTO_LIBRARY_LIMIT, removable.length);
  if (removeCount <= 0) return;

  const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(PHOTO_LIBRARY_STORE);
  for (const record of removable.slice(0, removeCount)) store.delete(record.key);
  await done;
}

export async function storeTryOnPhoto(
  userId: string,
  file: File,
  options: StorePhotoOptions = {},
): Promise<TryOnPhotoLibraryEntry> {
  const database = await openPhotoLibrary();
  try {
    const id = options.id?.trim() || crypto.randomUUID();
    const now = Date.now();
    const key = tryOnPhotoStorageKey(userId, id);
    const existingTransaction = database.transaction(PHOTO_LIBRARY_STORE, "readonly");
    const existingDone = transactionDone(existingTransaction);
    const existingValue = await requestResult(existingTransaction.objectStore(PHOTO_LIBRARY_STORE).get(key));
    await existingDone;
    const existing = isStoredTryOnPhoto(existingValue) ? existingValue : null;
    const record: StoredTryOnPhoto = {
      key,
      id,
      userId,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
    };

    const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(PHOTO_LIBRARY_STORE).put(record);
    await done;
    await trimPhotoLibrary(database, userId, [id, ...(options.preserveIds ?? [])]);

    return { id, file, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt };
  } finally {
    database.close();
  }
}

export async function getTryOnPhoto(userId: string, photoId: string): Promise<TryOnPhotoLibraryEntry | null> {
  const database = await openPhotoLibrary();
  try {
    const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(
      transaction.objectStore(PHOTO_LIBRARY_STORE).get(tryOnPhotoStorageKey(userId, photoId)),
    );
    await done;
    if (!isStoredTryOnPhoto(value) || value.userId !== userId || value.id !== photoId) return null;
    return {
      id: value.id,
      file: asFile(value),
      createdAt: value.createdAt,
      lastUsedAt: value.lastUsedAt,
    };
  } finally {
    database.close();
  }
}

export async function listTryOnPhotos(userId: string): Promise<TryOnPhotoLibraryEntry[]> {
  const database = await openPhotoLibrary();
  try {
    return (await recordsForUser(database, userId))
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt || right.createdAt - left.createdAt)
      .slice(0, TRY_ON_PHOTO_LIBRARY_LIMIT)
      .map((record) => ({
        id: record.id,
        file: asFile(record),
        createdAt: record.createdAt,
        lastUsedAt: record.lastUsedAt,
      }));
  } finally {
    database.close();
  }
}

export async function touchTryOnPhoto(userId: string, photoId: string) {
  const entry = await getTryOnPhoto(userId, photoId);
  if (!entry) return null;
  return storeTryOnPhoto(userId, entry.file, { id: entry.id, preserveIds: [entry.id] });
}

export async function deleteTryOnPhoto(userId: string, photoId: string) {
  const database = await openPhotoLibrary();
  try {
    const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(PHOTO_LIBRARY_STORE).delete(tryOnPhotoStorageKey(userId, photoId));
    await done;
  } finally {
    database.close();
  }
}

export async function clearTryOnPhotos(userId: string) {
  const database = await openPhotoLibrary();
  try {
    const records = await recordsForUser(database, userId);
    if (records.length === 0) return;
    const transaction = database.transaction(PHOTO_LIBRARY_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(PHOTO_LIBRARY_STORE);
    for (const record of records) store.delete(record.key);
    await done;
  } finally {
    database.close();
  }
}
