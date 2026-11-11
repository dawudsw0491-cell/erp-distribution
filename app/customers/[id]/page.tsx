
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { updateCustomerStatusAction } from "../actions";

export const metadata = {
  title: "Detail Pelanggan | HEXACORE ERP",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-gray-900">
        {value || "-"}
      </p>
    </div>
  );
}

async function CustomerDetailContent({
  params,
  searchParams,
}: Props) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    notFound();
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.view");

  if (!authorized) {
    redirect("/customers?error=unauthorized");
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Customer detail error:", error);
    notFound();
  }

  if (!customer) {
    notFound();
  }

  const successMessages: Record<string, string> = {
    created: "Pelanggan berhasil dibuat.",
    updated: "Data pelanggan berhasil diperbarui.",
  };

  const errorMessages: Record<string, string> = {
    status_update_failed: "Gagal memperbarui status pelanggan.",
    unauthorized: "Anda tidak memiliki hak akses.",
  };

  const successMessage = query.success
    ? successMessages[query.success]
    : null;

  const errorMessage = query.error
    ? errorMessages[query.error]
    : null;

  return (
    <div className="flex min-h-screen bg-gray-50 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/customers" />

      <main className="min-w-0 flex-1 md:h-screen md:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
          <div className="mb-6 text-sm text-gray-500">
            <Link href="/customers" className="hover:text-blue-600">
              Master Data
            </Link>
            {" / "}
            <Link href="/customers" className="hover:text-blue-600">
              Master Pelanggan
            </Link>
            {" / Detail"}
          </div>

          {successMessage && (
            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Detail Pelanggan
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Informasi lengkap master pelanggan.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/customers"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Kembali
              </Link>

              <Link
                href={`/customers/${id}/edit`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Edit Pelanggan
              </Link>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Kode Pelanggan
                </p>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {customer.customer_code}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">
                  {customer.customer_name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {customer.customer_type === "company"
                    ? "Perusahaan"
                    : "Perorangan"}
                </p>
              </div>

              <div>
                <span
                  className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
                    customer.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {customer.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-semibold text-gray-900">
                Informasi Kontak
              </h2>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <DetailItem
                  label="Nomor Telepon"
                  value={customer.phone ?? "-"}
                />

                <DetailItem
                  label="Email"
                  value={customer.email ?? "-"}
                />

                <DetailItem
                  label="NPWP"
                  value={customer.tax_number ?? "-"}
                />
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-semibold text-gray-900">
                Alamat
              </h2>

              <div className="space-y-5">
                <DetailItem
                  label="Alamat Lengkap"
                  value={customer.address ?? "-"}
                />

                <div className="grid grid-cols-2 gap-5">
                  <DetailItem
                    label="Kota / Kabupaten"
                    value={customer.city ?? "-"}
                  />

                  <DetailItem
                    label="Provinsi"
                    value={customer.province ?? "-"}
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 text-lg font-semibold text-gray-900">
              Informasi Kredit dan Pembayaran
            </h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <DetailItem
                label="Termin Pembayaran"
                value={`${customer.payment_term_days} hari`}
              />

              <DetailItem
                label="Limit Kredit"
                value={formatCurrency(customer.credit_limit)}
              />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Pengelolaan Status
            </h2>

            <p className="mb-4 text-sm text-gray-500">
              Pelanggan nonaktif tidak dapat digunakan untuk transaksi
              penjualan baru. Riwayat transaksi tetap dipertahankan.
            </p>

            <form action={updateCustomerStatusAction}>
              <input type="hidden" name="id" value={customer.id} />
              <input
                type="hidden"
                name="is_active"
                value={customer.is_active ? "false" : "true"}
              />

              <button
                type="submit"
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  customer.is_active
                    ? "border border-red-300 text-red-700 hover:bg-red-50"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {customer.is_active
                  ? "Nonaktifkan Pelanggan"
                  : "Aktifkan Pelanggan"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function CustomerDetailPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          Memuat data pelanggan...
        </div>
      }
    >
      <CustomerDetailContent
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
