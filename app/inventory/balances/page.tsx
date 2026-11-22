
import { Suspense } from "react";
import Link from "next/link";
import RealtimeFilterBar from "@/components/filters/realtime-filter-bar";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Stock Balance | HEXACORE ERP",
  description: "Saldo persediaan produk per gudang",
};

type SearchParams = Promise<{
  q?: string;
  warehouse?: string;
  page?: string;
  status?: string;
}>;

type BalanceRow = {
  product_id: string | null;
  product_variant_id: string | null;
  warehouse_id: string;
  available_quantity: number;
  reserved_quantity: number;
  quarantine_quantity: number;
  damaged_quantity: number;
  repair_quantity: number;
  on_hand_quantity: number;
  inventory_value: number;
  average_unit_cost: number;
};

type ProductRow = {
  id: string;
  sku: string;
  product_name: string;
  tracking_type: string;
  unit: string;
  minimum_stock: number;
  is_active: boolean;
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type StockStatus =
  | "all"
  | "available"
  | "reserved"
  | "damaged"
  | "repair"
  | "zero";

type StockDisplayRow = {
  product: ProductRow;
  warehouse: WarehouseRow;
  available: number;
  reserved: number;
  damaged: number;
  repair: number;
  onHand: number;
  value: number;
  averageCost: number;
  minimumStock: number;
};

const PAGE_SIZE = 10;
const QUERY_BATCH_SIZE = 1000;

const STATUS_COLUMNS: Record<
  Exclude<StockStatus, "all" | "zero">,
  keyof Pick<
    StockDisplayRow,
    "available" | "reserved" | "damaged" | "repair"
  >
> = {
  available: "available",
  reserved: "reserved",
  damaged: "damaged",
  repair: "repair",
};

type RangeQuery<T> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

async function fetchAllRows<T>(query: RangeQuery<T>): Promise<{
  data: T[];
  error: { message: string } | null;
}> {
  const allRows: T[] = [];

  for (let offset = 0; ; offset += QUERY_BATCH_SIZE) {
    const { data, error } = await query.range(
      offset,
      offset + QUERY_BATCH_SIZE - 1
    );

    if (error) {
      return { data: [], error };
    }

    const batch = (data ?? []) as T[];
    allRows.push(...batch);

    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }
  }

  return { data: allRows, error: null };
}

function numberFormat(value: number) {
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

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    warehouse: string;
    status: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);

  if (filters.warehouse) {
    params.set("warehouse", filters.warehouse);
  }

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  params.set("page", String(page));

  return `/inventory/balances?${params.toString()}`;
}

function getTrackingLabel(value: string) {
  const labels: Record<string, string> = {
    quantity: "Quantity",
    imei: "IMEI",
    serial: "Serial Number",
  };

  return labels[value] ?? value;
}

function StockBalanceError({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-w-0 flex-1 p-5 md:p-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
          <h1 className="font-bold text-red-700">
            Gagal Memuat Stock Balance
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Data persediaan belum dapat ditampilkan. Silakan coba
            kembali atau hubungi administrator sistem.
          </p>

          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {message}
          </p>

          <Link
            href="/inventory/balances"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Muat Ulang
          </Link>
        </div>
      </main>
    </div>
  );
}

async function StockBalanceContent({
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
              Anda tidak memiliki permission untuk melihat Stock Balance.
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

  const allowedStatuses: StockStatus[] = [
    "all",
    "available",
    "reserved",
    "damaged",
    "repair",
    "zero",
  ];

  const statusFilter: StockStatus = allowedStatuses.includes(
    params.status as StockStatus
  )
    ? (params.status as StockStatus)
    : "all";

  const parsedPage = Number.parseInt(params.page ?? "1", 10);

  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  const [productResult, warehouseResult, balanceResult, variantResult] =
    await Promise.all([
      fetchAllRows<ProductRow>(
        supabase
          .from("products")
          .select(
            "id, sku, product_name, tracking_type, unit, minimum_stock, is_active"
          )
          .eq("is_active", true)
          .order("sku", { ascending: true })
      ),

      fetchAllRows<WarehouseRow>(
        supabase
          .from("warehouses")
          .select("id, warehouse_code, warehouse_name")
          .eq("is_active", true)
          .order("warehouse_name", { ascending: true })
      ),

      fetchAllRows<BalanceRow>(
        supabase
          .from("inventory_balances")
          .select(`
            product_id,
            product_variant_id,
            warehouse_id,
            available_quantity,
            reserved_quantity,
            quarantine_quantity,
            damaged_quantity,
            repair_quantity,
            on_hand_quantity,
            inventory_value,
            average_unit_cost
          `)
          .not("product_variant_id", "is", null)
          .order("product_variant_id", { ascending: true })
          .order("warehouse_id", { ascending: true })
      ),

      fetchAllRows<{
        id: string;
        product_id: string;
        variant_sku: string;
        variant_name: string;
      }>(
        supabase
          .from("product_variants")
          .select("id, product_id, variant_sku, variant_name")
          .eq("is_active", true)
          .order("variant_sku", { ascending: true })
      ),
    ]);

  if (productResult.error) {
    return <StockBalanceError message={productResult.error.message} />;
  }

  if (warehouseResult.error) {
    return <StockBalanceError message={warehouseResult.error.message} />;
  }

  if (balanceResult.error) {
    return <StockBalanceError message={balanceResult.error.message} />;
  }

  if (variantResult.error) {
    return <StockBalanceError message={variantResult.error.message} />;
  }

  const products = productResult.data;
  const warehouses = warehouseResult.data;
  const balances = balanceResult.data;

  const parentProductMap = new Map(
    products.map((product) => [product.id, product])
  );
  const productMap = new Map<string, ProductRow>();
  for (const variant of variantResult.data) {
    const parent = parentProductMap.get(variant.product_id);
    if (!parent) continue;
    productMap.set(variant.id, {
      ...parent,
      id: variant.id,
      sku: variant.variant_sku,
      product_name: parent.product_name + " · " + variant.variant_name,
    });
  }

  const warehouseMap = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse])
  );

  const validWarehouse = warehouses.some(
    (warehouse) => warehouse.id === warehouseFilter
  );

  const effectiveWarehouseFilter = validWarehouse
    ? warehouseFilter
    : "";

  const balanceMap = new Map<string, BalanceRow>();

  for (const balance of balances) {
    if (!balance.product_variant_id) continue;

    balanceMap.set(
      `${balance.product_variant_id}:${balance.warehouse_id}`,
      balance
    );
  }

  const safeKeyword = keyword.toLowerCase();

  // Stock Balance hanya dibentuk dari kombinasi produk-gudang
  // yang benar-benar mempunyai record inventory_balances.
  let rows: StockDisplayRow[] = balances.flatMap((balance) => {
    if (!balance.product_variant_id) return [];

    const product = productMap.get(balance.product_variant_id);
    const warehouse = warehouseMap.get(balance.warehouse_id);

    if (!product || !warehouse) return [];

    if (
      effectiveWarehouseFilter &&
      warehouse.id !== effectiveWarehouseFilter
    ) {
      return [];
    }

    return [{
      product,
      warehouse,
      available: Number(balance.available_quantity ?? 0),
      reserved: Number(balance.reserved_quantity ?? 0),
      damaged: Number(balance.damaged_quantity ?? 0),
      repair: Number(balance.repair_quantity ?? 0),
      onHand: Number(balance.on_hand_quantity ?? 0),
      value: Number(balance.inventory_value ?? 0),
      averageCost: Number(balance.average_unit_cost ?? 0),
      minimumStock: Number(product.minimum_stock ?? 0),
    }];
  });

  if (safeKeyword) {
    rows = rows.filter((row) =>
      [
        row.product.sku,
        row.product.product_name,
        row.warehouse.warehouse_code,
        row.warehouse.warehouse_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(safeKeyword)
    );
  }

  if (statusFilter === "zero") {
    rows = rows.filter((row) => row.onHand === 0);
  } else if (statusFilter !== "all") {
    const column = STATUS_COLUMNS[statusFilter];
    rows = rows.filter((row) => row[column] > 0);
  }

  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  const currentPage = Math.min(
    requestedPage,
    Math.max(totalPages, 1)
  );

  if (
    requestedPage !== currentPage ||
    (warehouseFilter && !validWarehouse)
  ) {
    redirect(
      buildPageUrl(currentPage, {
        q: keyword,
        warehouse: effectiveWarehouseFilter,
        status: statusFilter,
      })
    );
  }

  const offset = (currentPage - 1) * PAGE_SIZE;
  const paginatedRows = rows.slice(offset, offset + PAGE_SIZE);

  const totals = rows.reduce(
    (result, row) => ({
      available: result.available + row.available,
      reserved: result.reserved + row.reserved,
      onHand: result.onHand + row.onHand,
      value: result.value + row.value,
    }),
    {
      available: 0,
      reserved: 0,
      onHand: 0,
      value: 0,
    }
  );

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
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
                  Stock Balance
                </h1>
              </div>

              <p className="mt-1 text-sm text-slate-600">
                Saldo persediaan produk berdasarkan Product Master dan gudang.
              </p>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Baris</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {numberFormat(totalRows)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kombinasi produk dan gudang
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total On Hand</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {numberFormat(totals.onHand)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Seluruh kategori persediaan
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Available</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {numberFormat(totals.available)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Siap digunakan atau dijual
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Nilai Persediaan</p>
              <p className="mt-2 break-words text-xl font-bold text-slate-900">
                {currencyFormat(totals.value)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Berdasarkan inventory valuation
              </p>
            </div>
          </section>

          <RealtimeFilterBar
            key={[
              keyword,
              effectiveWarehouseFilter,
              statusFilter,
            ].join("|")}
            initialKeyword={keyword}
            searchLabel="Pencarian Stock Balance"
            searchPlaceholder="SKU, nama produk, kode gudang, nama gudang..."
            helperText="Pencarian dan filter gudang serta status persediaan diperbarui otomatis."
            filters={[
              {
                param: "warehouse",
                label: "Gudang",
                initialValue: effectiveWarehouseFilter,
                options: [
                  { value: "", label: "Semua Gudang" },
                  ...warehouses.map((warehouse) => ({
                    value: warehouse.id,
                    label: warehouse.warehouse_code + " - " + warehouse.warehouse_name,
                  })),
                ],
              },
              {
                param: "status",
                label: "Status Persediaan",
                initialValue: statusFilter === "all" ? "" : statusFilter,
                options: [
                  { value: "", label: "Semua Status" },
                  { value: "available", label: "Available" },
                  { value: "reserved", label: "Reserved" },
                  { value: "damaged", label: "Damaged" },
                  { value: "repair", label: "Repair" },
                  { value: "zero", label: "Stok Kosong" },
                ],
              },
            ]}
          />

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Daftar Saldo Persediaan
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Menampilkan {totalRows === 0 ? 0 : offset + 1}
                {" - "}
                {Math.min(offset + PAGE_SIZE, totalRows)}
                {" dari "}
                {totalRows} baris.
              </p>
            </div>

            {totalRows === 0 ? (
              <div className="px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  Data tidak ditemukan
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Tidak ada record saldo persediaan yang sesuai dengan filter.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1460px] table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "300px" }} />
                      <col style={{ width: "190px" }} />
                      <col style={{ width: "190px" }} />
                      <col style={{ width: "105px" }} />
                      <col style={{ width: "105px" }} />
                      <col style={{ width: "105px" }} />
                      <col style={{ width: "105px" }} />
                      <col style={{ width: "120px" }} />
                      <col style={{ width: "150px" }} />
                      <col style={{ width: "170px" }} />
                    </colgroup>

                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-4 text-left font-semibold">Produk</th>
                        <th className="px-4 py-4 text-left font-semibold">SKU</th>
                        <th className="px-4 py-4 text-left font-semibold">Gudang</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Available</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Reserved</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Damaged</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Repair</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">On Hand</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Avg. Cost</th>
                        <th className="whitespace-nowrap px-3 py-4 text-right font-semibold">Inventory Value</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {paginatedRows.map((row) => {
                        const belowMinimum =
                          row.minimumStock > 0 &&
                          row.onHand < row.minimumStock;

                        return (
                          <tr
                            key={`${row.product.id}:${row.warehouse.id}`}
                            className="align-top hover:bg-blue-50/40"
                          >
                            <td className="px-4 py-4 align-top">
                              <p className="whitespace-normal break-words font-semibold leading-5 text-slate-900">
                                {row.product.product_name}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                  {getTrackingLabel(row.product.tracking_type)}
                                </span>

                                {row.onHand === 0 && (
                                  <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                                    Stok Kosong
                                  </span>
                                )}

                                {belowMinimum && row.onHand > 0 && (
                                  <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                                    Di bawah minimum
                                  </span>
                                )}
                              </div>

                              {row.minimumStock > 0 && (
                                <p className="mt-1 text-xs text-slate-400">
                                  Minimum: {numberFormat(row.minimumStock)}
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-4 text-left align-top font-medium text-slate-800">
                              <span className="block whitespace-normal break-all leading-5">
                                {row.product.sku}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-left align-top text-slate-700">
                              <p className="whitespace-normal break-words font-medium leading-5">
                                {row.warehouse.warehouse_name}
                              </p>
                              <p className="mt-1 whitespace-normal break-all text-xs leading-4 text-slate-400">
                                {row.warehouse.warehouse_code}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 text-right align-top font-semibold tabular-nums text-emerald-700">
                              {numberFormat(row.available)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top tabular-nums">
                              {numberFormat(row.reserved)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top tabular-nums">
                              {numberFormat(row.damaged)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top tabular-nums">
                              {numberFormat(row.repair)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top font-bold tabular-nums text-slate-900">
                              {numberFormat(row.onHand)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top tabular-nums">
                              {currencyFormat(row.averageCost)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right align-top font-semibold tabular-nums text-slate-900">
                              {currencyFormat(row.value)}
                            </td>
                          </tr>
                        );
                      })}
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
                          warehouse: effectiveWarehouseFilter,
                          status: statusFilter,
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
                          warehouse: effectiveWarehouseFilter,
                          status: statusFilter,
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
        </div>
      </main>
    </div>
  );
}

export default function StockBalancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Stock Balance...
          </p>
        </main>
      }
    >
      <StockBalanceContent searchParams={searchParams} />
    </Suspense>
  );
}
