
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import {
  createInventoryMovementAction,
  postInventoryMovementAction,
} from "./actions";

export const metadata = {
  title: "Stock Movement | HEXACORE ERP",
  description: "Riwayat pergerakan persediaan",
};


type SearchParams = Promise<{
  q?: string;
  type?: string;
  status?: string;
  warehouse?: string;
  page?: string;
  success?: string;
  error?: string;
}>;


type MovementRow = {
  id: string;
  movement_group_id: string | null;
  product_variant_id: string;
  warehouse_id: string;
  product_unit_id: string | null;
  movement_type: string;
  status: string;
  quantity_delta: number;
  inventory_status: string | null;
  status_from: string | null;
  status_to: string | null;
  source_reference_type: string | null;
  source_reference_id: string | null;
  source_reference_number: string | null;
  reversal_of_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  posted_by: string | null;
  posted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

type VariantRow = {
  id: string;
  variant_sku: string;
  variant_name: string;
  products: {
    sku: string;
    product_name: string;
  } | null;
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

const PAGE_SIZE = 10;
const MAX_RECORDS = 5000;

const movementLabels: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  transfer_in: "Transfer Masuk",
  transfer_out: "Transfer Keluar",
  adjustment: "Adjustment",
  customer_return: "Customer Return",
  supplier_return: "Supplier Return",
  opening_balance: "Opening Balance",
  status_change: "Status Change",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  cancelled: "Cancelled",
};

const inventoryStatusLabels: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  quarantine: "Quarantine",
  damaged: "Damaged",
  repair: "Repair",
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function getStatusStyle(status: string) {
  if (status === "posted") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "cancelled") {
    return "bg-red-100 text-red-700";
  }

  return "bg-amber-100 text-amber-700";
}

function getQuantityStyle(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-600";
}

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    type: string;
    status: string;
    warehouse: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.warehouse) {
    params.set("warehouse", filters.warehouse);
  }

  params.set("page", String(page));

  return `/inventory/movements?${params.toString()}`;
}

async function StockMovementContent({
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
              Anda tidak memiliki permission untuk melihat Stock Movement.
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

  const successMessage = params.success ?? "";
const errorMessage = params.error ?? "";

  const keyword = (params.q ?? "").trim().slice(0, 100);
  const typeFilter = params.type ?? "";
  const statusFilter = params.status ?? "";
  const warehouseFilter = params.warehouse ?? "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const validTypes = Object.keys(movementLabels);
  const validStatuses = Object.keys(statusLabels);

  const selectedType = validTypes.includes(typeFilter)
    ? typeFilter
    : "";

  const selectedStatus = validStatuses.includes(statusFilter)
    ? statusFilter
    : "";

  const [
    movementResult,
    warehouseResult,
  ] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_RECORDS),

    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .order("warehouse_name", { ascending: true }),
  ]);

  if (movementResult.error || warehouseResult.error) {
  if (movementResult.error) {
    console.error(
      "[Stock Movement] Database error:",
      movementResult.error
    );
  }

  if (warehouseResult.error) {
    console.error(
      "[Stock Movement] Warehouse error:",
      warehouseResult.error
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />
      <main className="min-w-0 flex-1 p-5 md:p-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
          <h1 className="font-bold text-red-700">
            Gagal Memuat Stock Movement
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Data pergerakan persediaan atau data gudang tidak dapat dibaca.
            Silakan periksa koneksi dan hak akses database.
          </p>
        </div>
      </main>
    </div>
  );
}

  const movements = (movementResult.data ?? []) as MovementRow[];
  const warehouses = (warehouseResult.data ?? []) as WarehouseRow[];

  
const variantResult = await supabase
  .from("product_variants")
  .select(`
    id,
    variant_sku,
    variant_name,
    products (
      sku,
      product_name
    )
  `)
  .order("variant_sku", { ascending: true })
  .limit(2000);

if (variantResult.error) {
  console.error(
    "[Stock Movement] Product variant error:",
    variantResult.error
  );

  throw new Error("Gagal memuat varian produk.");
}

const variants = (variantResult.data ?? []) as unknown as VariantRow[];


  const variantMap = new Map(
    variants.map((item) => [item.id, item])
  );

  const warehouseMap = new Map(
    warehouses.map((item) => [item.id, item])
  );

  let rows = movements.map((movement) => ({
    movement,
    variant: variantMap.get(movement.product_variant_id),
    warehouse: warehouseMap.get(movement.warehouse_id),
  }));

  if (selectedType) {
    rows = rows.filter(
      (row) => row.movement.movement_type === selectedType
    );
  }

  if (selectedStatus) {
    rows = rows.filter(
      (row) => row.movement.status === selectedStatus
    );
  }

  if (warehouseFilter) {
    rows = rows.filter(
      (row) => row.movement.warehouse_id === warehouseFilter
    );
  }

  if (keyword) {
    const search = keyword.toLowerCase();

    rows = rows.filter(({ movement, variant, warehouse }) =>
      [
        movement.id,
        movement.source_reference_number ?? "",
        movement.source_reference_type ?? "",
        movement.notes ?? "",
        movement.movement_type,
        movement.status,
        movement.inventory_status ?? "",
        variant?.variant_sku ?? "",
        variant?.variant_name ?? "",
        variant?.products?.sku ?? "",
        variant?.products?.product_name ?? "",
        warehouse?.warehouse_name ?? "",
        warehouse?.warehouse_code ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
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
        type: selectedType,
        status: selectedStatus,
        warehouse: warehouseFilter,
      })
    );
  }

  const offset = (currentPage - 1) * PAGE_SIZE;
  const paginatedRows = rows.slice(offset, offset + PAGE_SIZE);

  const postedCount = rows.filter(
    (row) => row.movement.status === "posted"
  ).length;

  const draftCount = rows.filter(
    (row) => row.movement.status === "draft"
  ).length;

  const cancelledCount = rows.filter(
    (row) => row.movement.status === "cancelled"
  ).length;

  const totalQuantityIn = rows
    .filter((row) => row.movement.status === "posted")
    .reduce(
      (total, row) =>
        total + Math.max(Number(row.movement.quantity_delta), 0),
      0
    );

  const totalQuantityOut = rows
    .filter((row) => row.movement.status === "posted")
    .reduce(
      (total, row) =>
        total + Math.abs(
          Math.min(Number(row.movement.quantity_delta), 0)
        ),
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
                  Stock Movement
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Riwayat pergerakan persediaan seluruh gudang.
              </p>
            </div>

            <Link
              href="/inventory"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Inventory
            </Link>
          </header>


          {/* NOTIFIKASI HASIL STOCK MOVEMENT */}

          {successMessage === "draft_created" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-semibold">
                Draft berhasil disimpan.
              </div>
              <p className="mt-1">
                Data Stock Movement sudah tercatat dengan status Draft.
                Stok belum berubah sampai transaksi diposting.
              </p>
            </div>
          )}

          {successMessage === "posted" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-semibold">
                Stock Movement berhasil diposting.
              </div>
              <p className="mt-1">
                Transaksi sudah diproses oleh sistem.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="font-semibold">
                Gagal menyimpan Stock Movement.
              </div>
              <p className="mt-1 break-words">
                Detail error: {errorMessage}
              </p>
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Movement</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(totalRows)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sesuai filter aktif
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Posted</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {formatNumber(postedCount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Transaksi tercatat
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Draft</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">
                {formatNumber(draftCount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Belum diposting
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Barang Masuk</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {formatNumber(totalQuantityIn)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kuantitas posted
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Barang Keluar</p>
              <p className="mt-2 text-2xl font-bold text-red-700">
                {formatNumber(totalQuantityOut)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kuantitas posted
              </p>
            </div>
          </section>


<section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-slate-900">
      Buat Draft Stock Movement
    </h2>
    <p className="mt-1 text-sm text-slate-500">
      Buat transaksi mutasi stok sebelum dilakukan posting.
    </p>
  </div>

  <form
    action={createInventoryMovementAction}
    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
  >
    {/* 1. VARIAN PRODUK */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Varian Produk
      </label>
      <select
        name="product_variant_id"
        required
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">Pilih Varian Produk</option>
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.variant_sku} - {variant.variant_name}
          </option>
        ))}
      </select>
    </div>

    {/* 2. WAREHOUSE */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Warehouse
      </label>
      <select
        name="warehouse_id"
        required
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">Pilih Warehouse</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.warehouse_name}
          </option>
        ))}
      </select>
    </div>

    {/* 3. JENIS MOVEMENT */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Jenis Movement
      </label>
      <select
        name="movement_type"
        required
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">Pilih Jenis Movement</option>
        <option value="purchase">Purchase (Barang Masuk)</option>
        <option value="sale">Sale (Barang Keluar)</option>
        <option value="adjustment">Adjustment</option>
        <option value="customer_return">Customer Return</option>
        <option value="supplier_return">Supplier Return</option>
        <option value="opening_balance">Opening Balance</option>
      </select>
    </div>

    {/* 4. QUANTITY */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Quantity Delta
      </label>
      <input
        type="number"
        name="quantity_delta"
        step="any"
        required
        placeholder="Contoh: 10 atau -5"
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
      />
      <p className="mt-1 text-xs text-slate-500">
        Masuk positif, keluar negatif.
      </p>
    </div>

    {/* 5. STATUS INVENTORY */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Inventory Status
      </label>
      <select
        name="inventory_status"
        required
        defaultValue="available"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="available">Available</option>
        <option value="reserved">Reserved</option>
        <option value="quarantine">Quarantine</option>
        <option value="damaged">Damaged</option>
        <option value="repair">Repair</option>
      </select>
    </div>

    {/* 6. CATATAN */}
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Catatan
      </label>
      <input
        type="text"
        name="notes"
        maxLength={500}
        placeholder="Masukkan keterangan movement"
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
      />
    </div>

    {/* 7. TOMBOL SIMPAN */}
    <div className="flex flex-wrap gap-2 xl:col-span-3">
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Buat Draft Movement
      </button>
    </div>
  </form>
</section>


          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Pencarian dan Filter
            </h2>

            <form
              action="/inventory/movements"
              method="GET"
              className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <div>
                <label
                  htmlFor="movement-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kata Kunci
                </label>
                <input
                  id="movement-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  maxLength={100}
                  placeholder="Referensi, produk, catatan..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="movement-type"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Jenis Movement
                </label>
                <select
                  id="movement-type"
                  name="type"
                  defaultValue={selectedType}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Semua Jenis</option>
                  {Object.entries(movementLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="movement-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="movement-status"
                  name="status"
                  defaultValue={selectedStatus}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Semua Status</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="movement-warehouse"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Gudang
                </label>
                <select
                  id="movement-warehouse"
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

              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>
                <Link
                  href="/inventory/movements"
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Riwayat Pergerakan Persediaan
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Menampilkan {totalRows === 0 ? 0 : offset + 1}
                    {" - "}
                    {Math.min(offset + PAGE_SIZE, totalRows)}
                    {" dari "}
                    {totalRows} transaksi.
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  Data maksimum yang dibaca: {MAX_RECORDS.toLocaleString("id-ID")} record terbaru
                </span>
              </div>
            </div>

            {totalRows === 0 ? (
              <div className="px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  Belum Ada Pergerakan Persediaan
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Transaksi inventory akan muncul di sini setelah
                  tercatat melalui proses bisnis terkait.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-sm">
                    
<thead className="bg-slate-50 text-slate-700">
  <tr>
    {[
      "Tanggal",
      "Jenis",
      "Produk / Varian",
      "Gudang",
      "Kuantitas",
      "Status Stok",
      "Referensi",
      "Status",
      "Waktu Posting",
      "Aksi",
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
                      {paginatedRows.map(({ movement, variant, warehouse }) => (
                        <tr
                          key={movement.id}
                          className="align-top hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {formatDate(movement.created_at)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            <span className="font-semibold text-slate-800">
                              {movementLabels[movement.movement_type] ??
                                movement.movement_type}
                            </span>
                            {movement.reversal_of_id && (
                              <p className="mt-1 text-xs text-amber-700">
                                Reversal
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">
                              {variant?.products?.product_name ?? "Produk tidak ditemukan"}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {variant?.variant_name ?? "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {variant?.variant_sku ?? "-"}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                            {warehouse?.warehouse_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            <span
                              className={`font-bold ${getQuantityStyle(
                                Number(movement.quantity_delta)
                              )}`}
                            >
                              {Number(movement.quantity_delta) > 0 ? "+" : ""}
                              {formatNumber(Number(movement.quantity_delta))}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            {movement.movement_type === "status_change" ? (
                              <span className="text-xs text-slate-700">
                                {inventoryStatusLabels[movement.status_from ?? ""] ??
                                  movement.status_from ??
                                  "-"}
                                {" → "}
                                {inventoryStatusLabels[movement.status_to ?? ""] ??
                                  movement.status_to ??
                                  "-"}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-700">
                                {inventoryStatusLabels[
                                  movement.inventory_status ?? ""
                                ] ?? movement.inventory_status ?? "-"}
                              </span>
                            )}
                          </td>

                          <td className="max-w-[190px] px-4 py-4">
                            <p className="font-medium text-slate-800">
                              {movement.source_reference_number ?? "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {movement.source_reference_type ?? ""}
                            </p>
                            {movement.notes && (
                              <p className="mt-1 break-words text-xs text-slate-400">
                                {movement.notes}
                              </p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                                movement.status
                              )}`}
                            >
                              {statusLabels[movement.status] ??
                                movement.status}
                            </span>
                          </td>

                          
<td className="whitespace-nowrap px-4 py-4 text-slate-600">
  {formatDate(movement.posted_at)}
</td>

<td className="whitespace-nowrap px-4 py-4">
  {movement.status === "draft" && (
    <form
      action={postInventoryMovementAction}
      className="flex min-w-[150px] flex-col gap-2"
    >
      <input
        type="hidden"
        name="movement_id"
        value={movement.id}
      />

      <input
        type="number"
        name="unit_cost"
        min="0"
        step="any"
        placeholder="Biaya per unit"
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
      />

      <button
        type="submit"
        className="rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
      >
        Post Movement
      </button>
    </form>
  )}

  {movement.status === "posted" && (
    <span className="text-xs text-slate-500">
      Immutable
    </span>
  )}

  {movement.status === "cancelled" && (
    <span className="text-xs text-slate-500">
      Tidak tersedia
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
                        href={buildPageUrl(currentPage - 1, {
                          q: keyword,
                          type: selectedType,
                          status: selectedStatus,
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
                          type: selectedType,
                          status: selectedStatus,
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
              Kontrol Integritas Persediaan
            </h3>
            <p className="mt-1 text-sm text-blue-800">
              Riwayat ini hanya untuk pemantauan. Movement berstatus Posted
              tidak boleh diedit atau dihapus langsung. Koreksi transaksi
              harus melalui mekanisme reversal yang terkontrol.
            </p>
          </section>

          <p className="text-xs text-slate-500">
            Draft: {draftCount} | Posted: {postedCount} | Cancelled: {cancelledCount}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function StockMovementPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Stock Movement...
          </p>
        </main>
      }
    >
      <StockMovementContent searchParams={searchParams} />
    </Suspense>
  );
}
