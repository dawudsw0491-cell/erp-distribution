
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { updateWarehouseStatusAction } from "./actions";

type Warehouse = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  contact_person: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
  success?: string;
};

async function WarehousePageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = params.status ?? "all";
  const currentPage = Math.max(1, Number(params.page) || 1);
  const pageSize = 10;

  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/");

  let query = auth.supabase
    .from("warehouses")
    .select(
      "id, warehouse_code, warehouse_name, address, city, province, postal_code, contact_person, phone, is_active, created_at",
      { count: "exact" }
    );

  if (q) {
    const safeSearch = q.replace(/[,%()]/g, " ");
    query = query.or(
      `warehouse_code.ilike.%${safeSearch}%,warehouse_name.ilike.%${safeSearch}%,city.ilike.%${safeSearch}%`
    );
  }

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const from = (currentPage - 1) * pageSize;

  const { data, error, count } = await query
    .order("warehouse_name", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) {
    throw new Error("Gagal mengambil data warehouse.");
  }

  const warehouseList = (data ?? []) as Warehouse[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const { count: activeCount } = await auth.supabase
    .from("warehouses")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: inactiveCount } = await auth.supabase
    .from("warehouses")
    .select("*", { count: "exact", head: true })
    .eq("is_active", false);

  function pageUrl(page: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status !== "all") search.set("status", status);
    search.set("page", String(page));
    return `/warehouses?${search.toString()}`;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <ErpSidebar activePath="/warehouses" />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-blue-600">
                Inventory / Master Data
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Master Warehouse
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Kelola lokasi penyimpanan persediaan perusahaan.
              </p>
            </div>

            <Link
              href="/warehouses/new"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Tambah Warehouse
            </Link>
          </div>

          
{params.success === "created" && (
  <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
    Warehouse berhasil ditambahkan.
  </div>
)}

{params.success === "updated" && (
  <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
    Warehouse berhasil diperbarui.
  </div>
)}

          
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Total Warehouse</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {activeCount !== null && inactiveCount !== null
                  ? activeCount + inactiveCount
                  : "-"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Warehouse Aktif</p>
              <p className="mt-2 text-2xl font-bold text-green-600">
                {activeCount ?? "-"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Warehouse Nonaktif</p>
              <p className="mt-2 text-2xl font-bold text-slate-500">
                {inactiveCount ?? "-"}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
            <form
              method="GET"
              action="/warehouses"
              className="flex flex-col gap-3 md:flex-row"
            >
              <input
                name="q"
                defaultValue={q}
                placeholder="Cari kode, nama, atau kota warehouse..."
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />

              <select
                name="status"
                defaultValue={status}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>

              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Cari
              </button>

              <Link
                href="/warehouses"
                className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset
              </Link>
            </form>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Kode</th>
                    <th className="px-5 py-4">Nama Warehouse</th>
                    <th className="px-5 py-4">Lokasi</th>
                    <th className="px-5 py-4">Contact Person</th>
                    <th className="px-5 py-4">Telepon</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {warehouseList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-slate-500"
                      >
                        Belum ada data warehouse.
                      </td>
                    </tr>
                  ) : (
                    warehouseList.map((warehouse) => (
                      <tr key={warehouse.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                          {warehouse.warehouse_code}
                        </td>
                        <td className="px-5 py-4 font-medium">
  <Link
    href={`/warehouses/${warehouse.id}/edit`}
    className="text-blue-600 hover:text-blue-800 hover:underline"
  >
    {warehouse.warehouse_name}
  </Link>
</td>
                        <td className="px-5 py-4 text-slate-600">
                          {[warehouse.city, warehouse.province]
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {warehouse.contact_person || "-"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {warehouse.phone || "-"}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              warehouse.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {warehouse.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        

<td className="px-5 py-4">
  <div className="flex items-center gap-3">
    <Link
      href={`/warehouses/${warehouse.id}/edit`}
      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
    >
      Edit
    </Link>

    <form
      action={updateWarehouseStatusAction.bind(
        null,
        warehouse.id,
        !warehouse.is_active
      )}
    >
      <button
        type="submit"
        className={`whitespace-nowrap text-xs font-semibold ${
          warehouse.is_active
            ? "text-red-600 hover:text-red-800"
            : "text-green-600 hover:text-green-800"
        }`}
      >
        {warehouse.is_active ? "Nonaktifkan" : "Aktifkan"}
      </button>
    </form>
  </div>
</td>


                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center">
              <p>
                Menampilkan {total === 0 ? 0 : from + 1}–{Math.min(
                  from + pageSize,
                  total
                )} dari {total} warehouse
              </p>

              <div className="flex items-center gap-2">
                <Link
                  href={pageUrl(Math.max(1, currentPage - 1))}
                  aria-disabled={currentPage <= 1}
                  className={`rounded-lg border px-3 py-2 ${
                    currentPage <= 1
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Sebelumnya
                </Link>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <Link
                  href={pageUrl(Math.min(totalPages, currentPage + 1))}
                  aria-disabled={currentPage >= totalPages}
                  className={`rounded-lg border px-3 py-2 ${
                    currentPage >= totalPages
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Berikutnya
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<div className="p-8">Memuat Master Warehouse...</div>}>
      <WarehousePageContent searchParams={searchParams} />
    </Suspense>
  );
}
