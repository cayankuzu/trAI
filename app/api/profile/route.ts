import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson } from "@/lib/http/read-json-body";
import { createClient } from "@/lib/supabase/server";
import { isBottomSizeForSystem, TOP_SIZE_OPTIONS } from "@/lib/size-options";
import type { ProfileData } from "@/lib/types";

const optionalMeasurement = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum).nullable();

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(80),
  gender: z.enum(["female", "male", "other"]),
  heightCm: optionalMeasurement(80, 250),
  weightKg: optionalMeasurement(20, 350),
  chestCm: optionalMeasurement(40, 200),
  waistCm: optionalMeasurement(40, 200),
  hipCm: optionalMeasurement(40, 200),
  usualTopSize: z.enum(TOP_SIZE_OPTIONS).nullable(),
  usualBottomSize: z.string().trim().min(2).max(2).nullable(),
  bottomSizeSystem: z.enum(["EU", "W"]),
}).strict().superRefine((value, context) => {
  if (value.usualBottomSize && !isBottomSizeForSystem(value.usualBottomSize, value.bottomSizeSystem)) {
    context.addIssue({
      code: "custom",
      path: ["usualBottomSize"],
      message: "Pantolon bedeni seçilen sisteme uymuyor.",
    });
  }
});

async function context() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data, error } = await supabase.auth.getClaims();
  return { supabase, userId: error ? null : data?.claims?.sub ?? null };
}

export async function GET() {
  const { supabase, userId } = await context();
  if (!supabase || !userId) {
    return NextResponse.json({ error: "Oturumun sona erdi." }, { status: 401 });
  }

  const [profileResult, measurementResult] = await Promise.all([
    supabase.from("profiles").select("full_name,gender").eq("user_id", userId).single(),
    supabase.from("measurements").select("height_cm,weight_kg,chest_cm,waist_cm,hip_cm,usual_top_size,usual_bottom_size,bottom_size_system").eq("user_id", userId).single(),
  ]);

  if (profileResult.error || measurementResult.error) {
    return NextResponse.json({ error: "Profil bilgileri yüklenemedi." }, { status: 502 });
  }

  const data: ProfileData = {
    fullName: profileResult.data.full_name || "trAI kullanıcısı",
    gender: profileResult.data.gender ?? "other",
    heightCm: measurementResult.data.height_cm,
    weightKg: measurementResult.data.weight_kg,
    chestCm: measurementResult.data.chest_cm,
    waistCm: measurementResult.data.waist_cm,
    hipCm: measurementResult.data.hip_cm,
    usualTopSize: measurementResult.data.usual_top_size,
    usualBottomSize: measurementResult.data.usual_bottom_size,
    bottomSizeSystem: measurementResult.data.bottom_size_system ?? "EU",
  };
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const body = await readBoundedJson(request, 4 * 1024);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ error: "Profil isteği fazla büyük." }, { status: 413 });
  }
  const parsed = profileSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ölçüleri kontrol et." }, { status: 400 });
  }

  const { supabase, userId } = await context();
  if (!supabase || !userId) {
    return NextResponse.json({ error: "Oturumun sona erdi." }, { status: 401 });
  }

  const { data: updated, error } = await supabase.rpc("update_own_profile", {
    p_full_name: parsed.data.fullName,
    p_gender: parsed.data.gender,
    p_height_cm: parsed.data.heightCm,
    p_weight_kg: parsed.data.weightKg,
    p_chest_cm: parsed.data.chestCm,
    p_waist_cm: parsed.data.waistCm,
    p_hip_cm: parsed.data.hipCm,
    p_usual_top_size: parsed.data.usualTopSize,
    p_usual_bottom_size: parsed.data.usualBottomSize,
    p_bottom_size_system: parsed.data.bottomSizeSystem,
  });

  if (error || updated !== true) {
    return NextResponse.json({ error: "Profil bilgileri kaydedilemedi." }, { status: 502 });
  }

  return NextResponse.json({ data: parsed.data });
}
