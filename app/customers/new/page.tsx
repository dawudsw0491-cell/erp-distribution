
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import CustomerForm from "./customer-form";

export const metadata = {
  title: "Tambah Pelanggan | HEXACORE ERP",
};

async function NewCustomerContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();

  const params = await searchParams;

  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile || !auth.authorized) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
        <ErpSidebar activePath="/customers" />

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-xl font-bold text-red-700">
              Akses Ditolak
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Anda tidak memiliki izin untuk menambahkan pelanggan.
              Silakan hubungi administrator sistem.
            </p>

            <Link
              href="/customers"
              className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Kembali ke Daftar Pelanggan
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const errorMessages: Record<string, string> = {
    unauthorized: "Anda tidak memiliki hak akses.",
    invalid_customer_name: "Nama pelanggan wajib diisi.",
    invalid_customer_type: "Jenis pelanggan tidak valid.",
    invalid_email: "Format email tidak valid.",
    invalid_payment_term: "Termin pembayaran tidak valid.",
    invalid_credit_limit: "Limit kredit tidak valid.",
    create_failed: "Gagal menyimpan pelanggan. Silakan coba kembali.",
  };

  const errorMessage = params.error
    ? errorMessages[params.error]
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <ErpSidebar activePath="/customers" />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="mb-6 text-sm text-gray-500">
            <Link
              href="/master-data"
              className="hover:text-blue-600"
            >
              Master Data
            </Link>
            {" / "}
            <Link
              href="/customers"
              className="hover:text-blue-600"
            >
              Master Pelanggan
            </Link>
            {" / Tambah"}
          </div>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tambah Pelanggan
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Masukkan informasi pelanggan baru.
              </p>
            </div>

            <Link
              href="/customers"
              className="rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Kembali
            </Link>
          </div>

          {errorMessage && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-8">
            <CustomerForm />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">
            Memuat halaman tambah pelanggan...
          </p>
        </main>
      }
    >
      <NewCustomerContent searchParams={searchParams} />
    </Suspense>
  );
}
