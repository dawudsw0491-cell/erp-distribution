
"use server";

import "server-only";

import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
} from "crypto";
import { promisify } from "util";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const scrypt = promisify(scryptCallback);

export type CreateUserInput = {
  fullName: string;
  username: string;
  phone?: string;
  roleId: string;
  warehouseIds?: string[];
};

export type CreateUserResult = {
  success: boolean;
  message: string;
  userCode?: string;
  initialPin?: string;
};

export type UserActionResult = {
  success: boolean;
  message: string;
};

const ROLE_PREFIX: Record<string, string> = {
  owner: "OWN",
  manager: "MGR",
  finance: "FIN",
  purchasing: "PUR",
  warehouse: "WHS",
  auditor: "AUD",
  sales: "SAL",
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

/**
 * Validasi sesi Owner aktif.
 */
async function verifyActiveOwner() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false as const,
      message: "Sesi login tidak valid.",
    };
  }

  const admin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, user_code, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return {
      success: false as const,
      message: "Profil pengguna tidak valid atau tidak aktif.",
    };
  }

  const { data: ownerRole, error: roleError } = await admin
    .from("user_roles")
    .select("roles!inner(role_code, is_active)")
    .eq("user_id", user.id)
    .eq("roles.role_code", "owner")
    .eq("roles.is_active", true)
    .maybeSingle();

  if (roleError || !ownerRole) {
    return {
      success: false as const,
      message: "Akses ditolak. Hanya Owner aktif yang diizinkan.",
    };
  }

  return {
    success: true as const,
    userId: user.id,
    userCode: profile.user_code as string | null,
    admin,
  };
}

/**
 * Menulis audit log menggunakan Admin Client.
 */
async function writeUserAuditLog(input: {
  actorUserId: string;
  actorUserCode: string | null;
  action: "CREATE" | "ACTIVATE" | "DEACTIVATE" | "DELETE";
  targetUserId: string;
  targetUserCode: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("user_audit_logs")
    .insert({
      actor_user_id: input.actorUserId,
      actor_user_code: input.actorUserCode,
      action: input.action,
      target_user_id: input.targetUserId,
      target_user_code: input.targetUserCode,
      description: input.description,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("User audit log insertion failed:", error?.message);
    throw new Error("Audit log gagal disimpan.");
  }

  return data.id as string;
}

/**
 * Memperbarui status antrean penghapusan.
 */
async function updateDeletionRequest(
  requestId: string,
  status: "COMPLETED" | "FAILED",
  errorMessage?: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from("user_deletion_requests")
    .update({
      status,
      error_message: errorMessage ?? null,
      completed_at: status === "COMPLETED"
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "PENDING_AUTH_DELETE");

  if (error) {
    console.error(
      "Deletion request status update failed:",
      error.message
    );
    return false;
  }

  return true;
}

/**
 * Membuat akun pengguna baru.
 */
export async function createUser(
  input: CreateUserInput
): Promise<CreateUserResult> {
  const fullName = input.fullName.trim();
  const username = input.username.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const warehouseIds = [...new Set(input.warehouseIds ?? [])];

  if (!fullName || fullName.length > 150) {
    return {
      success: false,
      message: "Nama lengkap wajib diisi dan maksimal 150 karakter.",
    };
  }

  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return {
      success: false,
      message: "Format username tidak valid.",
    };
  }

  if (!input.roleId) {
    return {
      success: false,
      message: "Role wajib dipilih.",
    };
  }

  if (phone && !/^[0-9+()\-*\s]{6,25}$/.test(phone)) {
    return {
      success: false,
      message: "Format nomor telepon tidak valid.",
    };
  }

  const pepper = process.env.PIN_PEPPER;

  if (!pepper) {
    return {
      success: false,
      message: "Konfigurasi keamanan PIN belum tersedia.",
    };
  }

  let createdAuthUserId: string | null = null;

  try {
    const owner = await verifyActiveOwner();

    if (!owner.success) {
      return { success: false, message: owner.message };
    }

    const admin = owner.admin;

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id, role_code, role_name, is_active")
      .eq("id", input.roleId)
      .maybeSingle();

    if (roleError || !role || !role.is_active) {
      return {
        success: false,
        message: "Role tidak ditemukan atau sedang tidak aktif.",
      };
    }

    const prefix = ROLE_PREFIX[role.role_code];

    if (!prefix) {
      return {
        success: false,
        message: "Prefix untuk role tersebut belum dikonfigurasi.",
      };
    }

    if (role.role_code === "warehouse" && warehouseIds.length === 0) {
      return {
        success: false,
        message: "Pengguna Warehouse wajib memiliki penugasan gudang.",
      };
    }

    if (role.role_code !== "warehouse" && warehouseIds.length > 0) {
      return {
        success: false,
        message: "Penugasan gudang hanya diperbolehkan untuk role Warehouse.",
      };
    }

    const { data: existingUsername, error: usernameError } = await admin
      .from("user_profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();

    if (usernameError) {
      return {
        success: false,
        message: "Gagal memeriksa ketersediaan username.",
      };
    }

    if (existingUsername) {
      return {
        success: false,
        message: "Username sudah digunakan.",
      };
    }

    const { data: existingCodes, error: codeError } = await admin
      .from("user_profiles")
      .select("user_code")
      .like("user_code", `${prefix}%`);

    if (codeError) {
      return {
        success: false,
        message: "Gagal menghasilkan User ID.",
      };
    }

    const highestNumber = (existingCodes ?? []).reduce(
      (highest, item) => {
        const match = item.user_code?.match(
          new RegExp(`^${prefix}(\\d+)$`)
        );

        return match
          ? Math.max(highest, Number(match[1]))
          : highest;
      },
      0
    );

    const userCode = `${prefix}${String(highestNumber + 1).padStart(2, "0")}`;

    const internalEmail = `${username}@hexa-core.invalid`;
    const internalPassword = randomBytes(48).toString("base64url");
    const initialPin = String(randomInt(0, 10000)).padStart(4, "0");
    const pinHash = await hashPin(initialPin, pepper);

    const { data: authData, error: createAuthError } =
      await admin.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          username,
          user_code: userCode,
        },
      });

    if (createAuthError || !authData.user) {
      console.error("Auth user creation failed:", createAuthError?.message);

      return {
        success: false,
        message: "Gagal membuat identitas autentikasi pengguna.",
      };
    }

    createdAuthUserId = authData.user.id;

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .update({
        full_name: fullName,
        phone,
        username,
        user_code: userCode,
        is_active: true,
        pin_hash: pinHash,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        pin_updated_at: null,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", createdAuthUserId)
      .select("id")
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error(
        `Profil pengguna gagal disimpan: ${profileError?.message ?? "Profil tidak ditemukan."}`
      );
    }

    const { error: roleInsertError } = await admin
      .from("user_roles")
      .insert({
        user_id: createdAuthUserId,
        role_id: role.id,
        assigned_by: owner.userId,
      });

    if (roleInsertError) {
      throw new Error(`Penetapan role gagal: ${roleInsertError.message}`);
    }

    if (warehouseIds.length > 0) {
      const assignments = warehouseIds.map((warehouseId) => ({
        user_id: createdAuthUserId!,
        warehouse_id: warehouseId,
        assigned_by: owner.userId,
        is_active: true,
      }));

      const { error: warehouseError } = await admin
        .from("user_warehouse_access")
        .insert(assignments);

      if (warehouseError) {
        throw new Error(`Penugasan gudang gagal: ${warehouseError.message}`);
      }
    }

    await writeUserAuditLog({
      actorUserId: owner.userId,
      actorUserCode: owner.userCode,
      action: "CREATE",
      targetUserId: createdAuthUserId,
      targetUserCode: userCode,
      description: `Owner membuat akun ${userCode}.`,
      metadata: {
        full_name: fullName,
        username,
        role_code: role.role_code,
        warehouse_count: warehouseIds.length,
      },
    });

    return {
      success: true,
      message: "Akun pengguna berhasil dibuat.",
      userCode,
      initialPin,
    };
  } catch (error) {
    console.error("Create user process failed:", error);

    if (createdAuthUserId) {
      try {
        const admin = getSupabaseAdmin();
        const { error: rollbackError } =
          await admin.auth.admin.deleteUser(createdAuthUserId);

        if (rollbackError) {
          console.error("Create user rollback failed:", rollbackError.message);
        }
      } catch (rollbackError) {
        console.error("Create user rollback error:", rollbackError);
      }
    }

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Pembuatan akun gagal. Silakan coba kembali.",
    };
  }
}

/**
 * Mengaktifkan atau menonaktifkan akun.
 */
export async function setUserActive(
  targetUserId: string,
  isActive: boolean
): Promise<UserActionResult> {
  try {
    if (
      typeof targetUserId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId) ||
      typeof isActive !== "boolean"
    ) {
      return {
        success: false,
        message: "Parameter pengguna tidak valid.",
      };
    }

    const owner = await verifyActiveOwner();

    if (!owner.success) {
      return { success: false, message: owner.message };
    }

    if (!isActive && targetUserId === owner.userId) {
      return {
        success: false,
        message: "Anda tidak dapat menonaktifkan akun sendiri.",
      };
    }

    const admin = owner.admin;

    const { data: targetUser, error: targetError } = await admin
  .from("user_profiles")
  .select("id, user_code, full_name, is_active, deletion_pending")
  .eq("id", targetUserId)
  .maybeSingle();

if (targetError || !targetUser) {
  return {
    success: false,
    message: "Pengguna tidak ditemukan.",
  };
}

if (targetUser.deletion_pending) {
  return {
    success: false,
    message:
      "Akun sedang dalam proses penghapusan dan tidak dapat diubah statusnya.",
  };
}

    if (targetUser.is_active === isActive) {
      return {
        success: true,
        message: isActive
          ? "Akun sudah dalam status aktif."
          : "Akun sudah dalam status nonaktif.",
      };
    }

    if (!isActive) {
      const { data: targetOwnerRole, error: targetRoleError } = await admin
        .from("user_roles")
        .select("roles!inner(role_code, is_active)")
        .eq("user_id", targetUserId)
        .eq("roles.role_code", "owner")
        .eq("roles.is_active", true)
        .maybeSingle();

      if (targetRoleError) {
        return {
          success: false,
          message: "Gagal memeriksa role pengguna.",
        };
      }

      if (targetOwnerRole) {
        const { data: ownerAssignments, error: assignmentsError } =
          await admin
            .from("user_roles")
            .select("user_id")
            .eq("roles.role_code", "owner")
            .eq("roles.is_active", true);

        if (assignmentsError || !ownerAssignments) {
          return {
            success: false,
            message: "Gagal memeriksa daftar Owner.",
          };
        }

        const ownerIds = [
          ...new Set(ownerAssignments.map((item) => item.user_id)),
        ];

        const { data: activeOwners, error: activeOwnersError } = await admin
          .from("user_profiles")
          .select("id")
          .in("id", ownerIds)
          .eq("is_active", true);

        if (activeOwnersError || !activeOwners) {
          return {
            success: false,
            message: "Gagal memeriksa Owner aktif.",
          };
        }

        if (
          activeOwners.length <= 1 &&
          activeOwners.some((item) => item.id === targetUserId)
        ) {
          return {
            success: false,
            message: "Owner terakhir tidak dapat dinonaktifkan.",
          };
        }
      }
    }

    const { error: updateError } = await admin
      .from("user_profiles")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateError) {
      return {
        success: false,
        message: `Gagal memperbarui status akun: ${updateError.message}`,
      };
    }

    try {
      await writeUserAuditLog({
        actorUserId: owner.userId,
        actorUserCode: owner.userCode,
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        targetUserId,
        targetUserCode: targetUser.user_code,
        description: `Owner ${isActive ? "mengaktifkan" : "menonaktifkan"} akun ${targetUser.user_code ?? targetUserId}.`,
        metadata: {
          full_name: targetUser.full_name,
          previous_status: targetUser.is_active,
          new_status: isActive,
        },
      });
    } catch (auditError) {
      const { error: rollbackError } = await admin
        .from("user_profiles")
        .update({
          is_active: targetUser.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId);

      if (rollbackError) {
        console.error("Status rollback failed:", rollbackError.message);
      }

      throw auditError;
    }

    return {
      success: true,
      message: isActive
        ? "Akun berhasil diaktifkan."
        : "Akun berhasil dinonaktifkan.",
    };
  } catch (error) {
    console.error("User status update failed:", error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat memperbarui akun.",
    };
  }
}

/**
 * Menghapus akun melalui alur antrean penghapusan.
 *
 * Tahap 1: RPC memvalidasi dan membuat request serta audit
 * dalam satu transaksi PostgreSQL.
 *
 * Tahap 2: Server menghapus identitas melalui Supabase Auth.
 *
 * Tahap 3: Status request diperbarui menjadi COMPLETED.
 */
export async function deleteUser(
  targetUserId: string
): Promise<UserActionResult> {
  try {
    if (
      typeof targetUserId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)
    ) {
      return {
        success: false,
        message: "ID pengguna tidak valid.",
      };
    }

    const owner = await verifyActiveOwner();

    if (!owner.success) {
      return {
        success: false,
        message: owner.message,
      };
    }

    if (targetUserId === owner.userId) {
      return {
        success: false,
        message: "Anda tidak dapat menghapus akun sendiri.",
      };
    }

    const admin = owner.admin;

    // Ambil informasi target untuk pesan respons.
    const { data: targetUser, error: targetError } = await admin
      .from("user_profiles")
      .select("id, user_code, full_name, is_active, deletion_pending")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return {
        success: false,
        message: "Pengguna tidak ditemukan.",
      };
    }

    if (targetUser.deletion_pending) {
      return {
        success: false,
        message:
          "Penghapusan akun sedang atau pernah diproses. Periksa antrean penghapusan sebelum mencoba kembali.",
      };
    }

    // Tahap 1: validasi dan pencatatan transaksional di PostgreSQL.
    // Actor berasal dari sesi Owner yang sudah diverifikasi server.
    const { data: requestId, error: rpcError } = await admin.rpc(
      "request_user_deletion",
      {
        p_target_user_id: targetUserId,
        p_actor_user_id: owner.userId,
      }
    );

    if (rpcError || !requestId) {
      console.error(
        "User deletion RPC failed:",
        rpcError?.message
      );

      return {
        success: false,
        message:
          rpcError?.message ??
          "Permintaan penghapusan ditolak oleh database.",
      };
    }

    // Tahap 2: hapus identitas autentikasi.
    const { error: authDeleteError } =
      await admin.auth.admin.deleteUser(targetUserId);

    if (authDeleteError) {
      console.error(
        "Supabase Auth deletion failed:",
        authDeleteError.message
      );

      // Tandai request gagal terlebih dahulu.
      const requestUpdated = await updateDeletionRequest(
        requestId,
        "FAILED",
        authDeleteError.message
      );

      // Pulihkan profil agar akun dapat digunakan kembali.
      // Audit permintaan tetap dipertahankan.
      const { error: restoreError } = await admin
        .from("user_profiles")
        .update({
          is_active: targetUser.is_active,
          deletion_pending: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId)
        .eq("deletion_pending", true);

      if (restoreError) {
        console.error(
          "User profile restoration failed:",
          restoreError.message
        );

        return {
          success: false,
          message:
            "Penghapusan Auth gagal dan pemulihan profil juga gagal. Akun tetap dinonaktifkan untuk keamanan. Perlu rekonsiliasi administrator.",
        };
      }

      if (!requestUpdated) {
        return {
          success: false,
          message:
            "Penghapusan Auth gagal. Profil telah dipulihkan, tetapi status antrean belum berhasil diperbarui. Perlu rekonsiliasi administrator.",
        };
      }

      return {
        success: false,
        message:
          "Penghapusan Auth gagal. Profil telah dipulihkan dan permintaan tercatat sebagai FAILED.",
      };
    }

    // Tahap 3: Auth berhasil dihapus.
    // Auth deletion dapat memicu cascade penghapusan profil.
    const completed = await updateDeletionRequest(
      requestId,
      "COMPLETED"
    );

    if (!completed) {
      // Jangan mengembalikan status gagal kepada pengguna:
      // Auth sudah berhasil dihapus.
      // Request PENDING dapat direkonsiliasi kemudian.
      console.error(
        "Auth user deleted, but deletion request remains pending:",
        requestId
      );

      return {
        success: true,
        message:
          `Akun ${targetUser.user_code ?? ""} berhasil dihapus dari Supabase Auth. Pembaruan status antrean belum selesai dan memerlukan rekonsiliasi.`,
      };
    }

    return {
      success: true,
      message:
        `Akun ${targetUser.user_code ?? ""} berhasil dihapus permanen.`,
    };
  } catch (error) {
    console.error("Delete user process failed:", error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghapus akun.",
    };
  }
}
