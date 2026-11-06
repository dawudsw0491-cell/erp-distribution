
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import SupplierForm from "./supplier-form";

async function NewSupplierContent() {
  await connection();

  const auth = await getAuthorizationContext("suppliers.create");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile || !auth.authorized) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:flex">
        <ErpSidebar activePath="/suppliers" />

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-xl font-bold text-red-700">
              Akses Ditolak
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Anda tidak memiliki izin untuk menambahkan supplier.
              Silakan hubungi administrator sistem.
            </p>

            <Link
              href="/suppliers"
              className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Kembali ke Daftar Supplier
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <ErpSidebar activePath="/suppliers" />

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <Link
              href="/suppliers"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Kembali ke Daftar Supplier
            </Link>

            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              Tambah Supplier
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Masukkan informasi supplier baru ke dalam sistem ERP.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
            <SupplierForm />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NewSupplierPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-500">
            Memuat halaman tambah supplier...
          </p>
        </main>
      }
    >
      <NewSupplierContent />
    </Suspense>
  );
}
