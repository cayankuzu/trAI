import { NextResponse, type NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/read-json-body";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { supportSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = checkRateLimit(`support:${client}`, 5, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Çok fazla mesaj gönderdin. Daha sonra tekrar dene." }, { status: 429 });
  }

  const body = await readBoundedJson(request, 16 * 1024);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Destek isteği fazla büyük." }, { status: 413 });
  }
  const parsed = supportSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Formu kontrol et." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), mode: "demo" } });
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "Mesaj göndermek için yeniden giriş yap." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("support_requests")
    .insert({ user_id: userId, ...parsed.data })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Mesajın kaydedilemedi." }, { status: 502 });
  }

  return NextResponse.json({ data });
}
