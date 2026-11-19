
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import UserStatusButton from "./user-status-button";
import DeleteUserButton from "./delete-user-button";

export default function UsersPage() {
  return (
    <Suspense fallback={<main className="p-6">Memuat data pengguna...</main>}>
      <UsersContent />
    </Suspense>
  );
}

async function UsersContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = getSupabaseAdmin();

  // Verifikasi profil Owner aktif.
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    redirect("/");
  }

  // Verifikasi role Owner aktif.
  const { data: ownerRole, error: roleCheckError } = await admin
    .from("user_roles")
    .select("roles!inner(role_code, is_active)")
    .eq("user_id", user.id)
    .eq("roles.role_code", "owner")
    .eq("roles.is_active", true)
    .maybeSingle();

  if (roleCheckError || !ownerRole) redirect("/");

  // Ambil daftar pengguna.
  const { data: users, error: usersError } = await admin
    .from("user_profiles")
    .select(`
      id,
      user_code,
      username,
      full_name,
      phone,
      is_active,
      must_change_password,
      deletion_pending,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (usersError) {
    throw new Error(`Gagal mengambil profil pengguna: ${usersError.message}`);
  }

  // Ambil role pengguna.
  const { data: userRoles, error: userRolesError } = await admin
    .from("user_roles")
    .select(`
      user_id,
      roles (
        role_code,
        role_name
      )
    `);

  if (userRolesError) {
    throw new Error(`Gagal mengambil role pengguna: ${userRolesError.message}`);
  }

  const roleMap = new Map(
    (userRoles || []).map((item) => {
      const relation = item.roles;
      const role = Array.isArray(relation) ? relation[0] : relation;
      return [item.user_id, role];
    })
  );

  // Ambil maksimal 50 riwayat penghapusan terbaru.
  const { data: deletionRequests, error: deletionError } = await admin
    .from("user_deletion_requests")
    .select(`
      id,
      target_user_id,
      target_user_code,
      target_full_name,
      actor_user_id,
      actor_user_code,
      status,
      error_message,
      requested_at,
      completed_at
    `)
    .order("requested_at", { ascending: false })
    .limit(50);

  if (deletionError) {
    throw new Error(
      `Gagal mengambil riwayat penghapusan: ${deletionError.message}`
    );
  }

  function formatDate(value: string | null) {
    if (!value) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-700";

      case "FAILED":
        return "bg-red-100 text-red-700";

      case "PENDING_AUTH_DELETE":
        return "bg-yellow-100 text-yellow-800";

      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  return (
    <main className="space-y-8 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-gray-500">
            Kelola akun, role, status, dan riwayat penghapusan pengguna.
          </p>
        </div>

        <Link
          href="/users/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Tambah User
        </Link>
      </div>

      {/* USER LIST */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Daftar Pengguna</h2>
          <p className="text-sm text-gray-500">
            Daftar akun yang masih terdaftar dalam sistem.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">User ID</th>
                <th className="p-3">Nama</th>
                <th className="p-3">Username</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">PIN</th>
                <th className="p-3">Tindakan</th>
              </tr>
            </thead>

            <tbody>
              {users?.map((item) => {
                const role = roleMap.get(item.id);
                const isCurrentUser = item.id === user.id;

                return (
                  <tr key={item.id} className="border-t">
                    <td className="p-3 font-medium">
                      {item.user_code || "-"}
                    </td>

                    <td className="p-3">{item.full_name || "-"}</td>

                    <td className="p-3">{item.username || "-"}</td>

                    <td className="p-3">
                      {role?.role_name || role?.role_code || "-"}
                    </td>

                    <td className="p-3">
                      {item.deletion_pending ? (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                          Penghapusan Diproses
                        </span>
                      ) : item.is_active ? (
                        "Aktif"
                      ) : (
                        "Nonaktif"
                      )}
                    </td>

                    <td className="p-3">
                      {item.must_change_password
                        ? "Menunggu aktivasi PIN"
                        : "Aktif"}
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <UserStatusButton
                          userId={item.id}
                          isActive={item.is_active}
                          isCurrentUser={isCurrentUser}
                        />

                        <DeleteUserButton
                          userId={item.id}
                          userCode={item.user_code || "akun ini"}
                          isCurrentUser={isCurrentUser}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!users?.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500">
                    Belum ada pengguna.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* DELETION HISTORY */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            Riwayat Penghapusan Pengguna
          </h2>
          <p className="text-sm text-gray-500">
            Riwayat permintaan dan hasil penghapusan akun oleh Owner.
            Maksimal 50 catatan terbaru.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">User ID</th>
                <th className="p-3">Nama Pengguna</th>
                <th className="p-3">Dilakukan Oleh</th>
                <th className="p-3">Waktu Permintaan</th>
                <th className="p-3">Waktu Selesai</th>
                <th className="p-3">Status</th>
                <th className="p-3">Keterangan</th>
              </tr>
            </thead>

            <tbody>
              {deletionRequests?.map((request) => (
                <tr key={request.id} className="border-t align-top">
                  <td className="p-3 font-medium">
                    {request.target_user_code || "-"}
                  </td>

                  <td className="p-3">
                    {request.target_full_name || "-"}
                  </td>

                  <td className="p-3">
                    {request.actor_user_code || "-"}
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {formatDate(request.requested_at)}
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {formatDate(request.completed_at)}
                  </td>

                  <td className="p-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getStatusStyle(request.status)}`}
                    >
                      {request.status}
                    </span>
                  </td>

                  <td className="max-w-xs p-3">
                    {request.error_message ? (
                      <span className="text-red-600">
                        {request.error_message}
                      </span>
                    ) : request.status === "COMPLETED" ? (
                      <span className="text-green-700">
                        Penghapusan berhasil.
                      </span>
                    ) : request.status === "PENDING_AUTH_DELETE" ? (
                      <span className="text-yellow-700">
                        Menunggu penghapusan identitas autentikasi.
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}

              {!deletionRequests?.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-gray-500"
                  >
                    Belum ada riwayat penghapusan pengguna.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
