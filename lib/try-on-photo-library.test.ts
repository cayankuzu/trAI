import { describe, expect, it } from "vitest";
import {
  TRY_ON_PHOTO_LIBRARY_LIMIT,
  tryOnPhotoStorageKey,
} from "@/lib/try-on-photo-library";

describe("try-on local photo library boundaries", () => {
  it("namespaces every photo by the authenticated user", () => {
    expect(tryOnPhotoStorageKey("user-a", "photo-1")).not.toBe(
      tryOnPhotoStorageKey("user-b", "photo-1"),
    );
    expect(tryOnPhotoStorageKey("user/a", "photo:1")).toBe("user%2Fa:photo%3A1");
  });

  it("keeps the recent-photo cap deliberately small for local privacy", () => {
    expect(TRY_ON_PHOTO_LIBRARY_LIMIT).toBe(12);
  });
});
