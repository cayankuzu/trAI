const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function resolveAppUrl(
  configuredUrl: string | undefined,
  vercelEnv: string | undefined,
) {
  const value = configuredUrl?.trim() || "http://localhost:3000";
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL geçerli bir mutlak URL olmalıdır.");
  }

  if (vercelEnv === "production" && (
    !configuredUrl?.trim() ||
    url.protocol !== "https:" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  )) {
    throw new Error(
      "Vercel production ortamında NEXT_PUBLIC_APP_URL gerçek HTTPS alan adıyla tanımlanmalıdır.",
    );
  }

  return url.toString().replace(/\/$/, "");
}

export type BackendMode = "supabase" | "demo" | "misconfigured";

export function resolveBackendMode(
  nodeEnv: string | undefined,
  url: string,
  publishableKey: string,
): BackendMode {
  if (url && publishableKey) return "supabase";
  if (!url && !publishableKey && nodeEnv !== "production") return "demo";
  return "misconfigured";
}

const backendMode = resolveBackendMode(
  process.env.NODE_ENV,
  supabaseUrl,
  supabasePublishableKey,
);

if (backendMode === "misconfigured") {
  throw new Error(
    "Supabase yapılandırması eksik. NEXT_PUBLIC_SUPABASE_URL ve " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY değerlerini birlikte tanımlayın.",
  );
}

export const appConfig = {
  name: "trAI",
  appUrl: resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_ENV),
  supabaseUrl,
  supabasePublishableKey,
  backendMode,
  isSupabaseConfigured: backendMode === "supabase",
  isDemoMode: backendMode === "demo",
} as const;

export function getSupabaseConfig() {
  if (!appConfig.isSupabaseConfigured) {
    return null;
  }

  return {
    url: appConfig.supabaseUrl,
    publishableKey: appConfig.supabasePublishableKey,
  };
}
