import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getAuthorizationContext } from "@/lib/auth/authorization";

export type CreateBrandResult =
  | {
      success: true;
      id: string;
      name: string;
      existing?: boolean;
    }
  | {
      success: false;
      error: string;
    };

function normalizeBrandName(value: string): string {
  return value.trim().replace(/\\s+/g, " ").toUpperCase();
}

function generateBrandCode(name: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 17) || "ITEM";

  const suffix = randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `BRD-${slug}-${suffix}`;
}

export async function createBrandRecord(
  input: string,
  pathsToRevalidate: string[]
): Promise<CreateBrandResult> {
  const brandName = normalizeBrandName(input);

  if (!brandName) {
    return { success: false, error: "Nama brand wajib diisi." };
  }

  if (brandName.length > 255) {
    return {
      success: false,
      error: "Nama brand maksimal 255 karakter.",
    };
  }

  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login telah berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki izin membuat brand.",
    };
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("brands")
    .select("id, brand_name, is_active")
    .ilike("brand_name", brandName)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Brand lookup failed:", lookupError);
    return {
      success: false,
      error: "Gagal memeriksa brand yang sudah tersedia.",
    };
  }

  if (existing) {
    if (!existing.is_active) {
      return {
        success: false,
        error: "Brand sudah ada tetapi tidak aktif.",
      };
    }

    return {
      success: true,
      id: existing.id,
      name: existing.brand_name,
      existing: true,
    };
  }

  const { data, error } = await auth.supabase
    .from("brands")
    .insert({
      brand_code: generateBrandCode(brandName),
      brand_name: brandName,
      is_active: true,
    })
    .select("id, brand_name")
    .single();

  if (error || !data) {
    console.error("Create brand failed:", error);

    if (error?.code === "23505") {
      return {
        success: false,
        error: "Brand sudah terdaftar atau kode Brand sudah digunakan.",
      };
    }

    return {
      success: false,
      error: "Gagal menyimpan brand baru ke database.",
    };
  }

  for (const path of pathsToRevalidate) {
    revalidatePath(path);
  }

  return {
    success: true,
    id: data.id,
    name: data.brand_name,
  };
}
