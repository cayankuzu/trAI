import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/try-ons/route.ts", import.meta.url), "utf8");

describe("try-on generated image guard wiring", () => {
  it("inspects a downloaded provider image before preparing or uploading its result path", () => {
    const download = route.indexOf("resultImage = await downloadFalResultImage(generated.imageUrl)");
    const inspection = route.indexOf("await assertVisibleGeneratedImage(resultImage)");
    const prepare = route.indexOf('"prepare_try_on_result"', inspection);
    const upload = route.indexOf("await uploadImage(adminClient, resultPath, resultImage)", inspection);

    expect(download).toBeGreaterThan(-1);
    expect(inspection).toBeGreaterThan(download);
    expect(prepare).toBeGreaterThan(inspection);
    expect(upload).toBeGreaterThan(prepare);
  });

  it("rechecks a stored completed result before issuing a fresh signed URL", () => {
    const completedStart = route.indexOf("async function completedResult");
    const completedEnd = route.indexOf("async function requireTryOnMutation", completedStart);
    const completed = route.slice(completedStart, completedEnd);

    expect(completed).toContain('downloadPrivateImage(adminClient, row.result_path, "Prova sonucu")');
    expect(completed.indexOf("await assertVisibleGeneratedImage(storedResult)"))
      .toBeLessThan(completed.indexOf("await signedImageUrl(adminClient, row.result_path)"));
  });
});
