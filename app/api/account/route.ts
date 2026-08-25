import { NextResponse, type NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/read-json-body";
import {
  isSupabaseAuthCookieName,
  removeAllUserPhotos,
} from "@/lib/supabase/account-cleanup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DELETE_CONFIRMATION = "HESABIMI SİL";

function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
}

export async function DELETE(request: NextRequest) {
  const parsedBody = await readBoundedJson(request, 2 * 1024);
  if (!parsedBody.ok && parsedBody.reason === "too_large") {
    return NextResponse.json({ error: "Hesap silme isteği fazla büyük." }, { status: 413 });
  }
  const body = (parsedBody.ok ? parsedBody.value : null) as {
    confirmation?: unknown;
    password?: unknown;
  } | null;

  if (body?.confirmation !== DELETE_CONFIRMATION) {
    return NextResponse.json(
      { error: "Güvenlik onayı eşleşmiyor." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    const response = NextResponse.json({ data: { mode: "demo" } });
    expireCookie(response, "trai-demo-session");
    return response;
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email = claimsData?.claims?.email;
  if (claimsError || !userId || typeof email !== "string") {
    return NextResponse.json(
      { error: "Oturumun sona erdi." },
      { status: 401 },
    );
  }

  if (typeof body?.password !== "string" || body.password.length < 1 || body.password.length > 72) {
    return NextResponse.json(
      { error: "Hesabını silmek için mevcut şifreni gir." },
      { status: 400 },
    );
  }
  const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
    email,
    password: body.password,
  });
  if (reauthenticationError) {
    return NextResponse.json(
      { error: "Mevcut şifren doğrulanamadı." },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Güvenli hesap silme sunucusu yapılandırılmadı." },
      { status: 503 },
    );
  }

  try {
    await removeAllUserPhotos(
      adminClient.storage.from("user-photos"),
      userId,
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Fotoğraf temizliği tamamlanamadığı için hesap silinmedi. Tekrar deneyebilirsin.",
      },
      { status: 502 },
    );
  }

  let deleteError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await adminClient.rpc("delete_user_account", {
      p_user_id: userId,
    });
    deleteError = result.error || result.data !== true
      ? result.error ?? new Error("account deletion transition failed")
      : null;
    if (deleteError === null) break;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  if (deleteError) {
    return NextResponse.json(
      {
        error:
          "Fotoğrafların temizlendi ancak hesap kaydı kapatılamadı. Aynı silme işlemini yeniden deneyebilirsin.",
      },
      { status: 502 },
    );
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  const response = NextResponse.json({ data: { deleted: true } });
  expireCookie(response, "trai-demo-session");
  for (const cookie of request.cookies.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      expireCookie(response, cookie.name);
    }
  }

  return response;
}
