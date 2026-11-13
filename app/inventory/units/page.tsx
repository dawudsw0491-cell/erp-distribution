
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "IMEI Registry | HEXACORE ERP",
  description: "Registrasi dan pelacakan unit berdasarkan IMEI dan serial number",
};

type SearchParams = Promise<{
  q?: string;
  status?: string;
  warehouse?: string;
  page?: string;
}>;

type Identifier = {
  identifier_type: string;
  identifier_value: string;
};

type UnitRow = {
  id: string;
  product_variant_id: string;
  warehouse_id: string | null;
  unit_code: string;
  unit_status: string;
  received_at: string | null;
  unit_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product_variants: {
    variant_sku: string;
    variant_name: string;
    products: {
      sku: string;
      product_name: string;
      tracking_type: string;
    } | null;
  } | null;
  warehouses: {
    warehouse_code: string;
    warehouse_name: string;
  } | null;
  product_unit_identifiers: Identifier[];
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

const PAGE_SIZE = 10;
const MAX_RECORDS = 5000;

const unitStatuses: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  quarantine: "Quarantine",
  damaged: "Damaged",
  repair: "Repair",
  sold: "Sold",
  in_transit: "In Transit",
  returned_to_supplier: "Returned to Supplier",
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
}

function currencyFormat(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function statusStyle(status: string) {
  const styles: Record<string, string> = {
    available: "bg-emerald-100 text-emerald-700",
    reserved: "bg-blue-100 text-blue-700",
    quarantine: "bg-amber-100 text-amber-700",
    damaged: "bg-red-100 text-red-700",
    repair: "bg-orange-100 text-orange-700",
    sold: "bg-slate-200 text-slate-700",
    in_transit: "bg-indigo-100 text-indigo-700",
    returned_to_supplier: "bg-rose-100 text-rose-700",
  };

  return styles[status] ?? "bg-slate-100 text-slate-700";
}

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    status: string;
    warehouse: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.warehouse) params.set("warehouse", filters.warehouse);

  params.set("page", String(page));

  return `/inventory/units?${params.toString()}`;
}

async function UnitRegistryContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("inventory.view");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/inventory" />
        <main className="flex flex-1 items-center justify-center p-5">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              Akses Ditolak
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat IMEI Registry.
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
  const warehouseFilter = params.warehouse ?? "";
  const statusFilter = Object.keys(unitStatuses).includes(params.status ?? "")
    ? params.status!
    : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const [unitResult, warehouseResult] = await Promise.all([
    supabase
      .from("product_units")
      .select(`
        id,
        product_variant_id,
        warehouse_id,
        unit_code,
        unit_status,
        received_at,
        unit_cost,
        notes,
        created_at,
        updated_at,
        product_variants!inner (
          variant_sku,
          variant_name,
          products!inner (
            sku,
            product_name,
            tracking_type
          )
        ),
        warehouses (
          warehouse_code,
          warehouse_name
        ),
        product_unit_identifiers (
          identifier_type,
          identifier_value
        )
      `)
      .order("created_at", { ascending: false })
      .limit(MAX_RECORDS),

    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .order("warehouse_name", { ascending: true }),
  ]);

  if (unitResult.error || warehouseResult.error) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat IMEI Registry
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Data unit, identifier, atau gudang tidak dapat dibaca.
              Periksa relasi tabel dan kebijakan akses database.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const units = (unitResult.data ?? []) as unknown as UnitRow[];
  const warehouses = (warehouseResult.data ?? []) as WarehouseRow[];

  let rows = units;

  if (statusFilter) {
    rows = rows.filter((unit) => unit.unit_status === statusFilter);
  }

  if (warehouseFilter) {
    rows = rows.filter((unit) => unit.warehouse_id === warehouseFilter);
  }

  if (keyword) {
    const search = keyword.toLowerCase();

    rows = rows.filter((unit) => {
      const identifiers = (unit.product_unit_identifiers ?? [])
        .map((item) => [
          item.identifier_type,
          item.identifier_value,
        ].join(" "))
        .join(" ");

      return [
        unit.unit_code,
        unit.unit_status,
        unit.notes ?? "",
        unit.product_variants?.variant_sku ?? "",
        unit.product_variants?.variant_name ?? "",
        unit.product_variants?.products?.sku ?? "",
        unit.product_variants?.products?.product_name ?? "",
        unit.warehouses?.warehouse_name ?? "",
        identifiers,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const currentPage = Math.min(
    requestedPage,
    Math.max(totalPages, 1)
  );

  if (requestedPage !== currentPage) {
    redirect(
      buildPageUrl(currentPage, {
        q: keyword,
        status: statusFilter,
        warehouse: warehouseFilter,
      })
    );
  }

  const offset = (currentPage - 1) * PAGE_SIZE;
  const paginatedRows = rows.slice(offset, offset + PAGE_SIZE);

  const counts = units.reduce(
    (result, unit) => {
      result.total += 1;

      if (unit.unit_status in result.statuses) {
        result.statuses[unit.unit_status] += 1;
      }

      return result;
    },
    {
      total: 0,
      statuses: {
        available: 0,
        reserved: 0,
        quarantine: 0,
        damaged: 0,
        repair: 0,
        sold: 0,
        in_transit: 0,
        returned_to_supplier: 0,
      } as Record<string, number>,
    }
  );

  const totalUnitCost = units.reduce(
    (total, unit) => total + Number(unit.unit_cost || 0),
    0
  );

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/inventory"
                  className="text-sm font-medium text-blue-700 hover:underline"
                >
                  Inventory
                </Link>
                <span className="text-slate-400">/</span>
                <h1 className="text-2xl font-bold text-slate-900">
                  IMEI Registry
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Registrasi dan pelacakan unit berdasarkan IMEI dan serial number.
              </p>
            </div>

            <Link
              href="/inventory"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Inventory
            </Link>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Unit</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(counts.total)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Seluruh unit terdaftar
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Available</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {formatNumber(counts.statuses.available)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Unit siap digunakan atau dijual
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Reserved</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {formatNumber(counts.statuses.reserved)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Unit yang sudah dialokasikan
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Unit Cost</p>
              <p className="mt-2 break-words text-xl font-bold text-slate-900">
                {currencyFormat(totalUnitCost)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Akumulasi biaya unit terdaftar
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Komposisi Status Unit
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
              {Object.entries(unitStatuses).map(([status, label]) => (
                <div
                  key={status}
                  className="rounded-lg bg-slate-50 p-3"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatNumber(counts.statuses[status] ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Pencarian dan Filter
            </h2>

            <form
              action="/inventory/units"
              method="GET"
              className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              <div>
                <label
                  htmlFor="unit-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kata Kunci
                </label>
                <input
                  id="unit-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  maxLength={100}
                  placeholder="IMEI, serial, SKU, produk..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="unit-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status Unit
                </label>
                <select
                  id="unit-status"
                  name="status"
                  defaultValue={statusFilter}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Semua Status</option>
                  {Object.entries(unitStatuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="unit-warehouse"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Gudang
                </label>
                <select
                  id="unit-warehouse"
                  name="warehouse"
                  defaultValue={warehouseFilter}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Semua Gudang</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.warehouse_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 md:col-span-3">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>

                <Link
                  href="/inventory/units"
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
                Daftar Unit Terdaftar
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Menampilkan {totalRows === 0 ? 0 : offset + 1}
                {" - "}
                {Math.min(offset + PAGE_SIZE, totalRows)}
                {" dari "}
                {totalRows} unit.
              </p>
            </div>

            {totalRows === 0 ? (
              <div className="px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  Belum Ada Unit Terdaftar
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
                  Unit dengan tracking IMEI atau serial number akan muncul
                  setelah didaftarkan melalui proses penerimaan atau registrasi unit.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1150px] text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        {[
                          "Unit Code",
                          "Produk / Varian",
                          "IMEI / Serial Number",
                          "Gudang",
                          "Status",
                          "Tanggal Terima",
                          "Unit Cost",
                          "Catatan",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="whitespace-nowrap px-4 py-4 text-left font-semibold"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {paginatedRows.map((unit) => (
                        <tr
                          key={unit.id}
                          className="align-top hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                            {unit.unit_code}
                          </td>

                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">
                              {unit.product_variants?.products?.product_name ?? "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {unit.product_variants?.variant_name ?? "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              SKU: {unit.product_variants?.variant_sku ?? "-"}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            {(unit.product_unit_identifiers ?? []).length > 0 ? (
                              <div className="space-y-2">
                                {unit.product_unit_identifiers.map((identifier) => (
                                  <div key={`${identifier.identifier_type}:${identifier.identifier_value}`}>
                                    <p className="text-xs text-slate-500">
                                      {identifier.identifier_type.replaceAll("_", " ")}
                                    </p>
                                    <p className="break-all font-mono text-sm font-medium text-slate-800">
                                      {identifier.identifier_value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">
                                Belum ada identifier
                              </span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                            {unit.warehouses?.warehouse_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(unit.unit_status)}`}
                            >
                              {unitStatuses[unit.unit_status] ?? unit.unit_status}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {formatDate(unit.received_at)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-800">
                            {currencyFormat(Number(unit.unit_cost))}
                          </td>

                          <td className="max-w-[200px] px-4 py-4 text-slate-600">
                            <p className="break-words">
                              {unit.notes || "-"}
                            </p>
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
                        href={buildPageUrl(currentPage - 1, {
                          q: keyword,
                          status: statusFilter,
                          warehouse: warehouseFilter,
                        })}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
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
                        href={buildPageUrl(currentPage + 1, {
                          q: keyword,
                          status: statusFilter,
                          warehouse: warehouseFilter,
                        })}
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

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="text-sm font-semibold text-blue-900">
              Informasi Integritas Unit
            </h3>
            <p className="mt-1 text-sm text-blue-800">
              Setiap unit fisik memiliki identitas tersendiri. IMEI dan serial
              number dikelola melalui tabel identifier, sedangkan status dan
              lokasi unit mengikuti catatan product_units. Halaman ini hanya
              untuk pemantauan dan tidak mengubah data unit.
            </p>
          </section>

          <p className="text-xs text-slate-500">
            Data maksimum yang dibaca: {MAX_RECORDS.toLocaleString("id-ID")} unit terbaru.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function UnitRegistryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat IMEI Registry...
          </p>
        </main>
      }
    >
      <UnitRegistryContent searchParams={searchParams} />
    </Suspense>
  );
}
