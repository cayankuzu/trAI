import "server-only";

import { createFalClient } from "@fal-ai/client";
import { missingFalKeyError } from "./fal-errors";
import { runFalQueue, type FalTryOnOutput, type GenerateTryOnInput } from "./fal-queue";
import { submitFalTryOnOnce } from "./fal-submit";

export async function generateFalTryOn(input: GenerateTryOnInput): Promise<FalTryOnOutput> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw missingFalKeyError();

  const client = createFalClient({ credentials: key });

  return runFalQueue(client, input, (submitInput) =>
    submitFalTryOnOnce(key, submitInput));
}
