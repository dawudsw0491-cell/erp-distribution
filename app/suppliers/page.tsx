
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Daftar Supplier | DAWUD ERP",
  description: "Master data supplier ERP Distribution",
};

type SuppliersPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 10;

function formatCurrency(value: number | null, currency: string) {
  if (value === null) return "-";

  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    type: string;
    status: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);

  params.set("page", String(page));

  return `/suppliers?${params.toString()}`;
}

async function SuppliersContent({
  searchParams,
}: SuppliersPageProps) {
  await connection();

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("suppliers.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat data supplier.
              Silakan hubungi administrator sistem.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const params = await searchParams;

  const keyword = (params.q ?? "").trim().slice(0, 100);

  const supplierType = ["company", "individual"].includes(
    params.type ?? ""
  )
    ? params.type!
    : "";

  const status = ["active", "inactive"].includes(
    params.status ?? ""
  )
    ? params.status!
    : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const safeKeyword = keyword.replace(/[,%()]/g, "").trim();

  let supplierQuery = supabase
    .from("suppliers")
    .select(
      `
        id,
        supplier_code,
        supplier_type,
        supplier_name,
        phone,
        email,
        city,
        province,
        payment_term_days,
        credit_limit,
        currency_code,
        is_active
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (safeKeyword) {
    const pattern = `%${safeKeyword}%`;

    supplierQuery = supplierQuery.or(
      [
        `supplier_code.ilike.${pattern}`,
        `supplier_name.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `email.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (supplierType) {
    supplierQuery = supplierQuery.eq("supplier_type", supplierType);
  }

  if (status === "active") {
    supplierQuery = supplierQuery.eq("is_active", true);
  }

  if (status === "inactive") {
    supplierQuery = supplierQuery.eq("is_active", false);
  }

  const [
    totalResult,
    activeResult,
    inactiveResult,
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false),
  ]);

  if (
    totalResult.error ||
    activeResult.error ||
    inactiveResult.error
  ) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Ringkasan Supplier
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil statistik supplier.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const totalSuppliers = totalResult.count ?? 0;
  const activeSuppliers = activeResult.count ?? 0;
  const inactiveSuppliers = inactiveResult.count ?? 0;

  const offset = (requestedPage - 1) * PAGE_SIZE;

  const {
    data: suppliers,
    error,
    count,
  } = await supplierQuery.range(
    offset,
    offset + PAGE_SIZE - 1
  );

  if (error) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Data Supplier
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Data supplier tidak dapat diambil dari database.
              Silakan periksa koneksi atau hubungi administrator.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const filteredTotal = count ?? 0;
  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE);

  const currentPage = Math.min(
    requestedPage,
    Math.max(totalPages, 1)
  );

  if (requestedPage !== currentPage) {
    redirect(
      buildPageUrl(currentPage, {
        q: keyword,
        type: supplierType,
        status,
      })
    );
  }

  const filters = {
    q: keyword,
    type: supplierType,
    status,
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/suppliers" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Master Data Supplier
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Pengelolaan data pemasok perusahaan.
              </p>
            </div>

            <Link
              href="/suppliers/new"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              + Tambah Supplier
            </Link>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Total Supplier
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {totalSuppliers}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Supplier Aktif
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {activeSuppliers}
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Supplier Nonaktif
              </p>
              <p className="mt-2 text-2xl font-bold text-red-700">
                {inactiveSuppliers}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-900">
                Pencarian dan Filter
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cari supplier berdasarkan kode, nama, telepon, atau email.
              </p>
            </div>

            <form
              action="/suppliers"
              method="GET"
              className="grid grid-cols-1 gap-4 md:grid-cols-4"
            >
              <div className="md:col-span-2">
                <label
                  htmlFor="supplier-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kata Kunci
                </label>

                <input
                  id="supplier-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  placeholder="Kode, nama, telepon, atau email..."
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="supplier-type"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Jenis Supplier
                </label>

                <select
                  id="supplier-type"
                  name="type"
                  defaultValue={supplierType}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Jenis</option>
                  <option value="company">Perusahaan</option>
                  <option value="individual">Perorangan</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="supplier-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>

                <select
                  id="supplier-status"
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2 md:col-span-4">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>

                <Link
                  href="/suppliers"
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Daftar Supplier
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Menampilkan {filteredTotal === 0 ? 0 : offset + 1}
                  {" - "}
                  {Math.min(offset + PAGE_SIZE, filteredTotal)}
                  {" dari "}
                  {filteredTotal} supplier.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                Maksimal {PAGE_SIZE} data per halaman
              </span>
            </div>

            {filteredTotal === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="font-semibold text-slate-800">
                  Data supplier tidak ditemukan
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Ubah kata kunci atau filter pencarian.
                </p>
                <Link
                  href="/suppliers"
                  className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Tampilkan semua supplier
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Kode
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Nama Supplier
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Jenis
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Kontak
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Lokasi
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Termin
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Limit Kredit
                        </th>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {suppliers?.map((supplier) => (
                        <tr
                          key={supplier.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-semibold">
                            <Link
                              href={`/suppliers/${supplier.id}`}
                              className="text-blue-700 hover:text-blue-900 hover:underline"
                            >
                              {supplier.supplier_code}
                            </Link>
                          </td>

                          <td className="px-5 py-4 font-medium text-slate-900">
                            <Link
                              href={`/suppliers/${supplier.id}`}
                              className="hover:text-blue-700 hover:underline"
                            >
                              {supplier.supplier_name}
                            </Link>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {supplier.supplier_type === "company"
                              ? "Perusahaan"
                              : "Perorangan"}
                          </td>

                          <td className="px-5 py-4 text-slate-700">
                            <div>{supplier.phone || "-"}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {supplier.email || "-"}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-slate-700">
                            <div>{supplier.city || "-"}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {supplier.province || "-"}
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {supplier.payment_term_days} hari
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {formatCurrency(
                              supplier.credit_limit === null
                                ? null
                                : Number(supplier.credit_limit),
                              supplier.currency_code
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
                            {supplier.is_active ? (
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                Aktif
                              </span>
                            ) : (
                              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                                Nonaktif
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-slate-600">
                    Halaman {currentPage} dari {Math.max(totalPages, 1)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {currentPage > 1 ? (
                      <Link
                        href={buildPageUrl(currentPage - 1, filters)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Sebelumnya
                      </Link>
                    ) : (
                      <span className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
                        Sebelumnya
                      </span>
                    )}

                    {currentPage < totalPages ? (
                      <Link
                        href={buildPageUrl(currentPage + 1, filters)}
                        className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Berikutnya
                      </Link>
                    ) : (
                      <span className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
                        Berikutnya
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function SuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat data supplier...
          </p>
        </main>
      }
    >
      <SuppliersContent searchParams={searchParams} />
    </Suspense>
  );
}
