
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import UserForm from "./user-form";

export default function NewUserPage() {
  return (
    <Suspense fallback={<main className="p-6">Memuat form pengguna...</main>}>
      <NewUserContent />
    </Suspense>
  );
}

async function NewUserContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: ownerRole } = await supabase
    .from("user_roles")
    .select("roles!inner(role_code)")
    .eq("user_id", user.id)
    .eq("roles.role_code", "owner")
    .maybeSingle();

  if (!ownerRole) redirect("/");

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, role_code, role_name")
    .eq("is_active", true)
    .order("role_name");

  if (error) {
    throw new Error(`Gagal mengambil role: ${error.message}`);
  }

  return (
    <main className="max-w-2xl space-y-6 p-6">
      <div>
        <Link href="/users" className="text-sm text-blue-600">
          ← Kembali ke User Management
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Tambah User</h1>

        <p className="text-sm text-gray-500">
          Buat akun pengguna baru dan tentukan role aksesnya.
        </p>
      </div>

      <UserForm roles={roles || []} />
    </main>
  );
}
