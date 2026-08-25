import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/config";

type BrowserClientOptions = {
  signal?: AbortSignal;
};

export function createClient(options: BrowserClientOptions = {}) {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  if (!options.signal) {
    return createBrowserClient(config.url, config.publishableKey);
  }

  const signal = options.signal;
  const abortableFetch: typeof fetch = (input, init) => fetch(input, {
    ...init,
    signal,
  });
  return createBrowserClient(config.url, config.publishableKey, {
    // A singleton created elsewhere may use the default fetch. This short-lived
    // client must keep the upload request tied to the active prova timeout.
    isSingleton: false,
    global: { fetch: abortableFetch },
  });
}
