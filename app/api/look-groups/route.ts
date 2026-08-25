import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson } from "@/lib/http/read-json-body";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_JSON_BYTES = 4 * 1024;
const emptyQuerySchema = z.object({}).strict();
const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
}).strict();
const updateGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
}).strict();
const deleteGroupQuerySchema = z.object({ id: z.string().uuid() }).strict();

type GroupRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  looks: Array<{ count: number | string | null }> | { count: number | string | null } | null;
};

type CreatedGroupRow = Pick<GroupRow, "id" | "name" | "created_at" | "updated_at">;

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

function mutationError(error: { code?: string | null }, fallback: string) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "Bu isimde bir kombin grubu zaten var." }, { status: 409 });
  }
  if (error.code === "42501") {
    return NextResponse.json({ error: "Bu kombin grubu üzerinde işlem yapma yetkin yok." }, { status: 403 });
  }
  return NextResponse.json({ error: fallback }, { status: 502 });
}

function lookCount(value: GroupRow["looks"]) {
  const relation = Array.isArray(value) ? value[0] : value;
  const count = Number(relation?.count ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function GET(request: NextRequest) {
  const parsed = emptyQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Grup filtreleri geçersiz." }, { status: 400 });
  }

  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const { data, error } = await supabase
    .from("look_groups")
    .select("id,name,created_at,updated_at,looks(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "Kombin grupları yüklenemedi." }, { status: 502 });
  }

  const groups = ((data ?? []) as unknown as GroupRow[]).map((group) => ({
    id: group.id,
    name: group.name,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    lookCount: lookCount(group.looks),
  }));
  return NextResponse.json({ data: groups });
}

export async function POST(request: NextRequest) {
  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const body = await readBoundedJson(request, MAX_JSON_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Grup isteği fazla büyük." }, { status: 413 });
  }
  const parsed = createGroupSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: "Grup adı 1–60 karakter arasında olmalı." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("look_groups")
    .insert({ user_id: userId, name: parsed.data.name })
    .select("id,name,created_at,updated_at")
    .single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("look_groups")
      .select("id,name,created_at,updated_at")
      .eq("user_id", userId)
      .eq("name", parsed.data.name)
      .maybeSingle();
    if (existingError) return mutationError(existingError, "Kombin grubu kaydı doğrulanamadı.");
    if (existing?.name === parsed.data.name) {
      const reused = existing as CreatedGroupRow;
      return NextResponse.json({
        data: {
          id: reused.id,
          name: reused.name,
          createdAt: reused.created_at,
          updatedAt: reused.updated_at,
          lookCount: 0,
        },
        reused: true,
      });
    }
  }
  if (error) return mutationError(error, "Kombin grubu oluşturulamadı.");

  return NextResponse.json({
    data: {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lookCount: 0,
    },
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const body = await readBoundedJson(request, MAX_JSON_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Grup isteği fazla büyük." }, { status: 413 });
  }
  const parsed = updateGroupSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: "Grup kimliği veya adı geçersiz." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("look_groups")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select("id,name,created_at,updated_at")
    .maybeSingle();
  if (error) return mutationError(error, "Kombin grubu güncellenemedi.");
  if (!data) return NextResponse.json({ error: "Güncellenecek kombin grubu bulunamadı." }, { status: 404 });

  return NextResponse.json({
    data: {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const parsed = deleteGroupQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Grup kimliği geçersiz." }, { status: 400 });
  }

  const { supabase, userId } = await authenticatedClient();
  if (!supabase) return configurationError();
  if (!userId) return authenticationError();

  const { data, error } = await supabase
    .from("look_groups")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return mutationError(error, "Kombin grubu silinemedi.");
  if (!data) return NextResponse.json({ error: "Silinecek kombin grubu bulunamadı." }, { status: 404 });

  return NextResponse.json({ data: { id: data.id } });
}
