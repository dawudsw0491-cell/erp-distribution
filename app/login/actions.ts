
"use server";

import { scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const scrypt = promisify(scryptCallback);

type LoginResult = {
  success: boolean;
  message?: string;
};

async function verifyPin(
  pin: string,
  storedHash: string,
  pepper: string
): Promise<boolean> {
  const [algorithm, salt, storedKey] = storedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !salt ||
    !storedKey ||
    !/^[a-f0-9]{128}$/i.test(storedKey)
  ) {
    return false;
  }

  const derivedKey = (await scrypt(
    `${pin}:${pepper}`,
    salt,
    64
  )) as Buffer;

  const storedBuffer = Buffer.from(storedKey, "hex");

  return (
    storedBuffer.length === derivedKey.length &&
    timingSafeEqual(derivedKey, storedBuffer)
  );
}

export async function loginWithUserId(
  identifier: string,
  pin: string
): Promise<LoginResult> {
  const normalizedIdentifier = identifier.trim();
  const pepper = process.env.PIN_PEPPER;

  if (!/^[A-Za-z0-9_-]{1,30}$/.test(normalizedIdentifier)) {
    return {
      success: false,
      message: "User ID atau Username tidak valid.",
    };
  }

  if (!/^\d{4}$/.test(pin)) {
    return {
      success: false,
      message: "PIN harus tepat 4 digit angka.",
    };
  }

  if (!pepper) {
    return {
      success: false,
      message: "Konfigurasi keamanan server belum lengkap.",
    };
  }

  try {
    const admin = getSupabaseAdmin();

    let { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select(
        "id, is_active, pin_hash, pin_failed_attempts, pin_locked_until, must_change_password"
      )
      .eq("user_code", normalizedIdentifier.toUpperCase())
      .maybeSingle();

    if (!profile && !profileError) {
      const result = await admin
        .from("user_profiles")
        .select(
          "id, is_active, pin_hash, pin_failed_attempts, pin_locked_until, must_change_password"
        )
        .ilike("username", normalizedIdentifier)
        .maybeSingle();

      profile = result.data;
      profileError = result.error;
    }

    if (profileError) {
      console.error("Login profile lookup failed:", profileError.message);
      return {
        success: false,
        message: "Gagal memeriksa akun. Silakan coba kembali.",
      };
    }

    if (!profile || !profile.is_active) {
      return {
        success: false,
        message: "User ID atau PIN salah, atau akun tidak aktif.",
      };
    }

    if (
      profile.pin_locked_until &&
      new Date(profile.pin_locked_until).getTime() > Date.now()
    ) {
      return {
        success: false,
        message: "Akun terkunci sementara. Silakan coba lagi setelah 15 menit.",
      };
    }

    if (!profile.pin_hash) {
      return {
        success: false,
        message: "PIN awal belum tersedia. Hubungi Owner untuk aktivasi akun.",
      };
    }

    const isValidPin = await verifyPin(pin, profile.pin_hash, pepper);

    if (!isValidPin) {
      const { error: failureError } = await admin.rpc(
        "register_pin_failure",
        { target_user_id: profile.id }
      );

      if (failureError) {
        console.error("PIN failure registration failed:", failureError.message);
      }

      return {
        success: false,
        message: "User ID atau PIN salah.",
      };
    }

    const {
      data: authUser,
      error: authUserError,
    } = await admin.auth.admin.getUserById(profile.id);

    const email = authUser.user?.email;

    if (authUserError || !email) {
      console.error("Auth user lookup failed:", authUserError?.message);

      return {
        success: false,
        message: "Identitas autentikasi pengguna tidak ditemukan.",
      };
    }

    const {
      data: linkData,
      error: linkError,
    } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const tokenHash = linkData?.properties?.hashed_token;

    if (linkError || !tokenHash) {
      console.error("Session link generation failed:", linkError?.message);

      return {
        success: false,
        message: "Gagal membuat sesi login. Silakan coba kembali.",
      };
    }

    const supabase = await createClient();

    const { error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (sessionError) {
      console.error("Session verification failed:", sessionError.message);

      return {
        success: false,
        message: "Sesi login gagal dibuat. Silakan coba kembali.",
      };
    }

    // Pastikan cookie sesi yang baru dibuat benar-benar dapat dibaca
    // sebelum server action menyatakan login berhasil.
    const {
      data: { user: sessionUser },
      error: sessionUserError,
    } = await supabase.auth.getUser();

    if (sessionUserError || sessionUser?.id !== profile.id) {
      console.error(
        "Login session persistence check failed:",
        sessionUserError?.message ?? "Authenticated user does not match profile."
      );

      return {
        success: false,
        message: "Sesi login belum tersimpan. Silakan coba kembali.",
      };
    }

    const { error: resetError } = await admin.rpc(
      "reset_pin_failures",
      { target_user_id: profile.id }
    );

    if (resetError) {
      console.error("PIN failure reset failed:", resetError.message);
    }

    return {
      success: true,
      message: "Login berhasil.",
    };
  } catch (error) {
    console.error("PIN login process failed:", error);

    return {
      success: false,
      message: "Terjadi kesalahan server. Silakan coba kembali.",
    };
  }
}
