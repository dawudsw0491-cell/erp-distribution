
"use server";

import {
  randomBytes,
  scrypt as scryptCallback,
} from "crypto";
import { promisify } from "util";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const scrypt = promisify(scryptCallback);

type SavePinResult = {
  success: boolean;
  message: string;
};

async function hashPin(pin: string, pepper: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");

  const derivedKey = (await scrypt(
    `${pin}:${pepper}`,
    salt,
    64
  )) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function saveNewPin(pin: string): Promise<SavePinResult> {
  if (!/^\d{4}$/.test(pin)) {
    return {
      success: false,
      message: "PIN harus tepat 4 digit angka.",
    };
  }

  const pepper = process.env.PIN_PEPPER;

  if (!pepper) {
    return {
      success: false,
      message: "Konfigurasi PIN_PEPPER belum tersedia.",
    };
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        message: "Sesi login tidak valid. Silakan login kembali.",
      };
    }

    const admin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, is_active, must_change_password")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError.message);

      return {
        success: false,
        message: "Gagal memeriksa profil pengguna.",
      };
    }

    if (!profile || !profile.is_active) {
      return {
        success: false,
        message: "Akun tidak aktif atau profil tidak ditemukan.",
      };
    }

    if (!profile.must_change_password) {
      return {
        success: false,
        message: "PIN tidak memerlukan aktivasi awal.",
      };
    }

    const pinHash = await hashPin(pin, pepper);
    const now = new Date().toISOString();

    const { data: updatedProfile, error: updateError } = await admin
      .from("user_profiles")
      .update({
        pin_hash: pinHash,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        pin_updated_at: now,
        must_change_password: false,
        updated_at: now,
      })
      .eq("id", user.id)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedProfile) {
      console.error("PIN update failed:", updateError?.message);

      return {
        success: false,
        message: "PIN gagal disimpan. Silakan coba kembali.",
      };
    }

    return {
      success: true,
      message: "PIN berhasil dibuat. Silakan login menggunakan PIN baru.",
    };
  } catch (error) {
    console.error("PIN save process failed:", error);

    return {
      success: false,
      message: "Terjadi kesalahan server. Silakan coba kembali.",
    };
  }
}
