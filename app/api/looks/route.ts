import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson } from "@/lib/http/read-json-body";
import { tryOnRenderModeForEndpoint } from "@/lib/ai/fal-endpoints";
import { createClient } from "@/lib/supabase/server";
import type { FitIntent, LookItem, TryOnResult, TryOnView } from "@/lib/types";

export const runtime = "nodejs";

const MAX_JSON_BYTES = 8 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const DEFAULT_LOOK_IMAGE = "/images/trai-fashion-hero.png";

const nullableUuid = z.string().uuid().nullable();
const lookListQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
}).strict();
const createLookSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  groupId: nullableUuid.optional().default(null),
  coverTryOnId: z.string().uuid(),
}).strict();
const updateLookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100).optional(),
  groupId: nullableUuid.optional(),
  coverTryOnId: z.string().uuid().optional(),
}).strict().refine(
  (value) => value.title !== undefined || value.groupId !== undefined || value.coverTryOnId !== undefined,
  { message: "Güncellenecek en az bir kombin alanı gerekli." },
);
const deleteLookQuerySchema = z.object({ id: z.string().uuid() }).strict();

type VariantRow = {
  id: string;
  session_id: string | null;
  result_path: string | null;
  product_url: string;
  created_at: string;
  selected_size: string | null;
  photo_view: string | null;
  fit_intent: string | null;
  fit_score: number | null;
  size_recommendation: string | null;
  provider_model: string | null;
  status: string;
};

type SessionRow = {
  id: string;
  product_url: string;
  selected_sizes: string[];
  recommendation_snapshot: unknown;
  try_ons: VariantRow[] | null;
};

type GroupRow = { id: string; name: string };

type LookRow = {
  id: string;
  title: string;
  created_at: string;
  try_on_session_id: string | null;
  cover_try_on_id: string | null;
  look_groups: GroupRow | GroupRow[] | null;
  try_on_sessions: SessionRow | SessionRow[] | null;
  legacy_try_on: VariantRow | VariantRow[] | null;
};

type CreatedLookRow = {
  id: string;
  title: string;
  try_on_session_id: string | null;
  group_id: string | null;
  cover_try_on_id: string | null;
  created_at: string;
};

type SignedPath = {
  path?: string | null;
  signedUrl?: string | null;
  error?: unknown;
};

async function authenticatedClient() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data, error } = await supabase.auth.getClaims();
  return { supabase, userId: error ? null : data?.claims?.sub ?? null };
}

function configurationError() {
  return NextResponse.json({ error: "Güvenli kullanıcı deposu yapılandırılmadı." }, { status: 503 });
}

function authenticationError() {
  return NextResponse.json({ error: "Oturumun sona erdi. Yeniden giriş yap." }, { status: 401 });
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isTryOnView(value: string | null): value is TryOnView {
  return value === "front" || value === "back";
}

function isFitIntent(value: string | null): value is FitIntent {
  return value === "fitted" || value === "regular" || value === "relaxed";
}

function recommendedSize(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as { recommendedSize?: unknown }).recommendedSize;
  return typeof value === "string" && value.length <= 20 ? value : null;
}

function completedVariantPaths(rows: LookRow[]) {
  const paths = new Set<string>();
  for (const row of rows) {
    const session = relationOne(row.try_on_sessions);
    for (const variant of session?.try_ons ?? []) {
      if (variant.status === "completed" && variant.result_path) paths.add(variant.result_path);
    }
    const legacy = relationOne(row.legacy_try_on);
    if (legacy?.status === "completed" && legacy.result_path) paths.add(legacy.result_path);
  }
  return [...paths];
}

function toTryOnResult(
  variant: VariantRow,
  sessionId: string,
  signedUrls: ReadonlyMap<string, string>,
): TryOnResult | null {
  if (
    variant.status !== "completed"
    || !variant.result_path
    || !variant.selected_size
    || !isTryOnView(variant.photo_view)
    || !isFitIntent(variant.fit_intent)
  ) return null;

  const imageUrl = signedUrls.get(variant.result_path);
  if (!imageUrl) return null;
  return {
    id: variant.id,
    sessionId,
    imageUrl,
    productUrl: variant.product_url,
    createdAt: variant.created_at,
    size: variant.selected_size,
    view: variant.photo_view,
    fitIntent: variant.fit_intent,
    fitScore: variant.fit_score,
    sizeRecommendation: variant.size_recommendation,
    renderMode: tryOnRenderModeForEndpoint(variant.provider_model),
  };
}

async function groupIsOwned(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  groupId: string,
) {
  const { data, error } = await supabase
    .from("look_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function completedCoverIsOwned(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  sessionId: string,
  coverTryOnId: string,
) {
  const { data, error } = await supabase
    .from("try_ons")
    .select("id")
    .eq("id", coverTryOnId)
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("status", "completed")
    .not("result_path", "is", null)
    .maybeSingle();
  return !error && Boolean(data);
}

function mutationError(error: { code?: string | null }, fallback: string) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "Bu prova oturumu zaten kombinlerine kaydedilmiş." }, { status: 409 });
  }
  if (error.code === "42501") {
    return NextResponse.json({ error: "Bu kombin üzerinde işlem yapma yetkin yok." }, { status: 403 });
  }
  return NextResponse.json({ error: fallback }, { status: 502 });
}

function isExactCreateRetry(
  existing: CreatedLookRow,
  input: z.infer<typeof createLookSchema>,
) {
  return existing.try_on_session_id === input.sessionId
    && existing.title === input.title
    && existing.group_id === input.groupId
    && existing.cover_try_on_id === input.coverTryOnId;
}

export async function GET(request: NextRequest) {
  const query = lookListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "Kombin filtreleri geçersiz." }, { status: 400 });
  }

  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  let databaseQuery = supabase
    .from("looks")
    .select(`
      id,title,created_at,try_on_session_id,cover_try_on_id,
      look_groups!looks_group_id_fkey(id,name),
      try_on_sessions!looks_try_on_session_id_fkey(
        id,product_url,selected_sizes,recommendation_snapshot,
        try_ons(id,session_id,result_path,product_url,created_at,selected_size,photo_view,fit_intent,fit_score,size_recommendation,provider_model,status)
      ),
      legacy_try_on:try_ons!looks_try_on_id_fkey(
        id,session_id,result_path,product_url,created_at,selected_size,photo_view,fit_intent,fit_score,size_recommendation,provider_model,status
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (query.data.groupId) databaseQuery = databaseQuery.eq("group_id", query.data.groupId);

  const { data, error } = await databaseQuery;
  if (error) {
    return NextResponse.json({ error: "Kombinler yüklenemedi." }, { status: 502 });
  }
  const rows = (data ?? []) as unknown as LookRow[];
  const paths = completedVariantPaths(rows);
  const signedUrls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from("user-photos")
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (signedError) {
      return NextResponse.json({ error: "Kombin görselleri güvenli biçimde hazırlanamadı." }, { status: 502 });
    }
    for (const item of (signedData ?? []) as SignedPath[]) {
      if (!item.error && item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
    }
  }

  const looks: LookItem[] = rows.map((row) => {
    const session = relationOne(row.try_on_sessions);
    const variants = (session?.try_ons ?? [])
      .map((variant) => toTryOnResult(variant, session?.id ?? "", signedUrls))
      .filter((variant): variant is TryOnResult => Boolean(variant));
    const cover = variants.find((variant) => variant.id === row.cover_try_on_id) ?? variants[0] ?? null;
    const legacy = relationOne(row.legacy_try_on);
    const legacyImage = legacy?.result_path ? signedUrls.get(legacy.result_path) : null;
    const group = relationOne(row.look_groups);

    return {
      id: row.id,
      title: row.title,
      meta: new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(row.created_at)),
      label: session ? "AI beden karşılaştırması" : "AI görsel prova",
      image: cover?.imageUrl ?? legacyImage ?? DEFAULT_LOOK_IMAGE,
      productUrl: session?.product_url ?? legacy?.product_url,
      createdAt: row.created_at,
      group,
      sessionId: session?.id ?? null,
      selectedSizes: session?.selected_sizes ?? [],
      recommendedSize: recommendedSize(session?.recommendation_snapshot),
      variants,
    };
  });

  return NextResponse.json({ data: looks });
}

export async function POST(request: NextRequest) {
  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const body = await readBoundedJson(request, MAX_JSON_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Kombin isteği fazla büyük." }, { status: 413 });
  }
  const parsed = createLookSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: "Kombin adı, prova oturumu veya kapak seçimi geçersiz." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("try_on_sessions")
    .select("id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Prova oturumu doğrulanamadı." }, { status: 502 });
  if (!session) return NextResponse.json({ error: "Kaydedilecek prova oturumu bulunamadı." }, { status: 404 });

  if (parsed.data.groupId && !await groupIsOwned(supabase, userId, parsed.data.groupId)) {
    return NextResponse.json({ error: "Seçilen kombin grubu bulunamadı." }, { status: 404 });
  }
  if (!await completedCoverIsOwned(supabase, userId, parsed.data.sessionId, parsed.data.coverTryOnId)) {
    return NextResponse.json({ error: "Kapak olarak yalnız bu oturumun tamamlanmış bir prova sonucu seçilebilir." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("looks")
    .insert({
      user_id: userId,
      try_on_id: null,
      try_on_session_id: parsed.data.sessionId,
      group_id: parsed.data.groupId,
      cover_try_on_id: parsed.data.coverTryOnId,
      title: parsed.data.title,
    })
    .select("id,title,try_on_session_id,group_id,cover_try_on_id,created_at")
    .single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("looks")
      .select("id,title,try_on_session_id,group_id,cover_try_on_id,created_at")
      .eq("user_id", userId)
      .eq("try_on_session_id", parsed.data.sessionId)
      .maybeSingle();
    if (existingError) return mutationError(existingError, "Kombin kaydı doğrulanamadı.");
    if (existing && isExactCreateRetry(existing as CreatedLookRow, parsed.data)) {
      return NextResponse.json({ data: existing, reused: true });
    }
  }
  if (error) return mutationError(error, "Kombin kaydedilemedi.");

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const body = await readBoundedJson(request, MAX_JSON_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Kombin isteği fazla büyük." }, { status: 413 });
  }
  const parsed = updateLookSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Kombin güncellemesi geçersiz." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("looks")
    .select("id,try_on_session_id")
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Kombin doğrulanamadı." }, { status: 502 });
  if (!existing) return NextResponse.json({ error: "Güncellenecek kombin bulunamadı." }, { status: 404 });

  if (parsed.data.groupId && !await groupIsOwned(supabase, userId, parsed.data.groupId)) {
    return NextResponse.json({ error: "Seçilen kombin grubu bulunamadı." }, { status: 404 });
  }
  if (parsed.data.coverTryOnId) {
    if (!existing.try_on_session_id) {
      return NextResponse.json({ error: "Eski prova kayıtlarında kapak varyantı değiştirilemez." }, { status: 409 });
    }
    if (!await completedCoverIsOwned(supabase, userId, existing.try_on_session_id, parsed.data.coverTryOnId)) {
      return NextResponse.json({ error: "Kapak olarak yalnız bu oturumun tamamlanmış bir prova sonucu seçilebilir." }, { status: 400 });
    }
  }

  const updates: { title?: string; group_id?: string | null; cover_try_on_id?: string } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.groupId !== undefined) updates.group_id = parsed.data.groupId;
  if (parsed.data.coverTryOnId !== undefined) updates.cover_try_on_id = parsed.data.coverTryOnId;

  const { data, error } = await supabase
    .from("looks")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select("id,title,try_on_session_id,group_id,cover_try_on_id,created_at")
    .maybeSingle();
  if (error) return mutationError(error, "Kombin güncellenemedi.");
  if (!data) return NextResponse.json({ error: "Güncellenecek kombin bulunamadı." }, { status: 404 });

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const parsed = deleteLookQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Kombin kimliği geçersiz." }, { status: 400 });
  }

  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const { data, error } = await supabase
    .from("looks")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return mutationError(error, "Kombin silinemedi.");
  if (!data) return NextResponse.json({ error: "Silinecek kombin bulunamadı." }, { status: 404 });

  return NextResponse.json({ data: { id: data.id } });
}
