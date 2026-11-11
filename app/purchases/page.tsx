
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Purchase Order | HEXACORE ERP",
  description: "Pengelolaan pesanan pembelian",
};

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 10;

function formatCurrency(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Diajukan",
    approved: "Disetujui",
    partially_received: "Diterima Sebagian",
    received: "Selesai Diterima",
    cancelled: "Dibatalkan",
  };

  return labels[status] ?? status;
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-emerald-100 text-emerald-800",
    partially_received: "bg-amber-100 text-amber-800",
    received: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return classes[status] ?? "bg-slate-100 text-slate-700";
}

function buildPageUrl(
  page: number,
  filters: { q: string; status: string }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);

  params.set("page", String(page));

  return `/purchases?${params.toString()}`;
}

async function PurchasesContent({
  searchParams,
}: PurchasesPageProps) {
  await connection();

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.view");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    return (
      <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/purchases" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat Purchase Order.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
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

  const allowedStatuses = [
    "draft",
    "submitted",
    "approved",
    "partially_received",
    "received",
    "cancelled",
  ];

  const status = allowedStatuses.includes(params.status ?? "")
    ? params.status!
    : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const safeKeyword = keyword.replace(/[,%()]/g, "").trim();

  let query = supabase
    .from("purchase_orders")
    .select(
      `
        id,
        po_number,
        order_date,
        expected_date,
        status,
        grand_total,
        created_at,
        supplier:suppliers(supplier_name, supplier_code),
        warehouse:warehouses(warehouse_name, warehouse_code)
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (safeKeyword) {
    query = query.ilike("po_number", `%${safeKeyword}%`);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const [
    totalResult,
    draftResult,
    submittedResult,
    approvedResult,
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),

    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),

    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);

  if (
    totalResult.error ||
    draftResult.error ||
    submittedResult.error ||
    approvedResult.error
  ) {
    return (
      <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/purchases" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Statistik Purchase Order
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Periksa koneksi database dan hak akses.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const offset = (requestedPage - 1) * PAGE_SIZE;

  const {
    data: orders,
    error,
    count,
  } = await query.range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("Purchase Order query error:", error);

    return (
      <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/purchases" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Purchase Order
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Data Purchase Order tidak dapat diambil.
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

  const filters = { q: keyword, status };

  if (requestedPage !== currentPage) {
    redirect(buildPageUrl(currentPage, filters));
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/purchases" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 md:h-screen md:p-8">
        <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">

          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Purchase Order
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pengelolaan pesanan pembelian kepada supplier.
              </p>
            </div>

            <Link
              href="/purchases/new"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Buat Purchase Order
            </Link>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total Purchase Order",
                value: totalResult.count ?? 0,
                color: "text-slate-900",
              },
              {
                label: "Draft",
                value: draftResult.count ?? 0,
                color: "text-slate-700",
              },
              {
                label: "Diajukan",
                value: submittedResult.count ?? 0,
                color: "text-blue-700",
              },
              {
                label: "Disetujui",
                value: approvedResult.count ?? 0,
                color: "text-emerald-700",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-medium text-slate-600">
                  {item.label}
                </p>
                <p className={`mt-2 text-2xl font-bold ${item.color}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Pencarian dan Filter
            </h2>

            <form
              action="/purchases"
              method="GET"
              className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              <div className="md:col-span-2">
                <label
                  htmlFor="po-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Nomor Purchase Order
                </label>

                <input
                  id="po-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  maxLength={100}
                  placeholder="Cari nomor PO..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="po-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>

                <select
                  id="po-status"
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Status</option>
                  {allowedStatuses.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 md:col-span-3">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>

                <Link
                  href="/purchases"
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Daftar Purchase Order
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Menampilkan {filteredTotal === 0 ? 0 : offset + 1}
                {" - "}
                {Math.min(offset + PAGE_SIZE, filteredTotal)}
                {" dari "}
                {filteredTotal} Purchase Order.
              </p>
            </div>

            {filteredTotal === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="font-semibold text-slate-800">
                  Belum ada Purchase Order
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Buat Purchase Order pertama untuk memulai proses pembelian.
                </p>
                <Link
                  href="/purchases/new"
                  className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  + Buat Purchase Order
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="whitespace-nowrap px-5 py-4">Nomor PO</th>
                        <th className="whitespace-nowrap px-5 py-4">Supplier</th>
                        <th className="whitespace-nowrap px-5 py-4">Warehouse</th>
                        <th className="whitespace-nowrap px-5 py-4">Tanggal</th>
                        <th className="whitespace-nowrap px-5 py-4">Estimasi</th>
                        <th className="whitespace-nowrap px-5 py-4">Total</th>
                        <th className="whitespace-nowrap px-5 py-4">Status</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {orders?.map((order: any) => (
                        <tr key={order.id} className="hover:bg-blue-50/40">
                          <td className="whitespace-nowrap px-5 py-4 font-semibold">
                            <Link
                              href={`/purchases/${order.id}`}
                              className="text-blue-700 hover:underline"
                            >
                              {order.po_number}
                            </Link>
                          </td>

                          <td className="px-5 py-4 text-slate-700">
                            {order.supplier?.supplier_name ?? "-"}
                          </td>

                          <td className="px-5 py-4 text-slate-700">
                            {order.warehouse?.warehouse_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {formatDate(order.order_date)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {order.expected_date
                              ? formatDate(order.expected_date)
                              : "-"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-800">
                            {formatCurrency(Number(order.grand_total))}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}
                            >
                              {statusLabel(order.status)}
                            </span>
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

                  <div className="flex gap-2">
                    {currentPage > 1 ? (
                      <Link
                        href={buildPageUrl(currentPage - 1, filters)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Sebelumnya
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
                        Sebelumnya
                      </span>
                    )}

                    {currentPage < totalPages ? (
                      <Link
                        href={buildPageUrl(currentPage + 1, filters)}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Berikutnya
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
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

export default function PurchasesPage({
  searchParams,
}: PurchasesPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Purchase Order...
          </p>
        </main>
      }
    >
      <PurchasesContent searchParams={searchParams} />
    </Suspense>
  );
}
