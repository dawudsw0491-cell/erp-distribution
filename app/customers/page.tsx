``
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ErpSidebar from "@/components/layout/erp-sidebar";

export const metadata = {
  title: "Master Pelanggan | HEXACORE ERP",
};

type SearchParams = Promise<{
  q?: string;
  status?: string;
  page?: string;
  success?: string;
  error?: string;
}>;

const PAGE_SIZE = 10;

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function CustomerNotifications({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  const successMessages: Record<string, string> = {
    created: "Pelanggan berhasil dibuat.",
    updated: "Data pelanggan berhasil diperbarui.",
    status_updated: "Status pelanggan berhasil diperbarui.",
  };

  const errorMessages: Record<string, string> = {
    unauthorized: "Anda tidak memiliki hak akses.",
    invalid_customer_id: "ID pelanggan tidak valid.",
    invalid_status: "Status pelanggan tidak valid.",
    status_update_failed: "Gagal memperbarui status pelanggan.",
    create_failed: "Gagal membuat pelanggan.",
    update_failed: "Gagal memperbarui pelanggan.",
  };

  const message = success
    ? successMessages[success]
    : error
      ? errorMessages[error]
      : null;

  if (!message) return null;

  const isError = Boolean(error);

  return (
    <div
      className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      {message}
    </div>
  );
}

async function CustomerContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = ["active", "inactive"].includes(params.status ?? "")
    ? params.status!
    : "all";

  const requestedPage = Math.max(1, Number(params.page) || 1);

  const { supabase, authorized } =
    await getAuthorizationContext("master.view");

  if (!authorized) {
    return (
      <div className="p-8 text-sm text-red-600">
        Anda tidak memiliki hak akses untuk melihat Master Pelanggan.
      </div>
    );
  }

  let countQuery = supabase
    .from("customers")
    .select("id", { count: "exact", head: true });

  if (status === "active") {
    countQuery = countQuery.eq("is_active", true);
  } else if (status === "inactive") {
    countQuery = countQuery.eq("is_active", false);
  }

  if (query) {
    const escapedQuery = query.replace(/[,%()]/g, " ");
    countQuery = countQuery.or(
      `customer_code.ilike.%${escapedQuery}%,customer_name.ilike.%${escapedQuery}%`
    );
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error("Customer count error:", countError);
  }

  const totalRecords = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let customerQuery = supabase
    .from("customers")
    .select(
      "id, customer_code, customer_name, customer_type, phone, email, city, payment_term_days, credit_limit, is_active, created_at"
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status === "active") {
    customerQuery = customerQuery.eq("is_active", true);
  } else if (status === "inactive") {
    customerQuery = customerQuery.eq("is_active", false);
  }

  if (query) {
    const escapedQuery = query.replace(/[,%()]/g, " ");
    customerQuery = customerQuery.or(
      `customer_code.ilike.%${escapedQuery}%,customer_name.ilike.%${escapedQuery}%`
    );
  }

  const { data: customers, error: customerError } =
    await customerQuery;

  if (customerError) {
    console.error("Customer list error:", customerError);
  }

  const { count: activeCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: inactiveCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", false);

  const buildUrl = (page: number) => {
    const search = new URLSearchParams();

    if (query) search.set("q", query);
    if (status !== "all") search.set("status", status);
    if (page > 1) search.set("page", String(page));

    const queryString = search.toString();
    return `/customers${queryString ? `?${queryString}` : ""}`;
  };

  return (
    <>
      <CustomerNotifications
        success={params.success}
        error={params.error}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Master Pelanggan
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelola data pelanggan HEXACORE ERP.
          </p>
        </div>

        <Link
          href="/customers/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Tambah Pelanggan
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Pelanggan</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {activeCount !== null && inactiveCount !== null
              ? activeCount + inactiveCount
              : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Pelanggan Aktif</p>
          <p className="mt-2 text-2xl font-bold text-green-600">
            {activeCount ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Pelanggan Nonaktif</p>
          <p className="mt-2 text-2xl font-bold text-gray-500">
            {inactiveCount ?? "—"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            action="/customers"
            method="GET"
            className="flex flex-1 flex-col gap-2 sm:flex-row"
          >
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Cari kode atau nama pelanggan..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 sm:max-w-sm"
            />

            <select
              name="status"
              defaultValue={status}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>

            <button
              type="submit"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Cari
            </button>

            <Link
              href="/customers"
              className="rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </Link>
          </form>

          <p className="text-sm text-gray-500">
            {totalRecords} data ditemukan
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">Kode Pelanggan</th>
                <th className="px-5 py-3">Nama Pelanggan</th>
                <th className="px-5 py-3">Jenis</th>
                <th className="px-5 py-3">Kontak</th>
                <th className="px-5 py-3">Termin</th>
                <th className="px-5 py-3">Limit Kredit</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {customerError ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-red-600"
                  >
                    Gagal memuat data pelanggan.
                  </td>
                </tr>
              ) : !customers?.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    Belum ada data pelanggan.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-5 py-4 font-semibold text-blue-700">
                      {customer.customer_code}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">
                        {customer.customer_name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {customer.city || "-"}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {customer.customer_type === "company"
                        ? "Perusahaan"
                        : "Perorangan"}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      <p>{customer.phone || "-"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {customer.email || "-"}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {customer.payment_term_days} hari
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {formatCurrency(customer.credit_limit)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          customer.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {customer.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          Detail
                        </Link>

                        <Link
                          href={`/customers/${customer.id}/edit`}
                          className="font-medium text-gray-600 hover:text-gray-900"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Halaman {currentPage} dari {totalPages}
            {" · "}
            Menampilkan {customers?.length ?? 0} dari {totalRecords} data
          </p>

          <div className="flex gap-2">
            <Link
              href={buildUrl(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              className={`rounded-lg border px-3 py-2 text-sm ${
                currentPage <= 1
                  ? "pointer-events-none border-gray-200 text-gray-300"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Sebelumnya
            </Link>

            <Link
              href={buildUrl(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              className={`rounded-lg border px-3 py-2 text-sm ${
                currentPage >= totalPages
                  ? "pointer-events-none border-gray-200 text-gray-300"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Berikutnya
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}


export default function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <ErpSidebar activePath="/customers" />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl p-6 lg:p-8">
          <div className="mb-6 text-sm text-gray-500">
            Master Data / Master Pelanggan
          </div>

          <Suspense
            fallback={
              <div className="py-10 text-center text-sm text-gray-500">
                Memuat data pelanggan...
              </div>
            }
          >
            <CustomerContent searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

