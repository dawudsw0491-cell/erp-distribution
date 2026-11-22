
import { Suspense } from "react";
import Link from "next/link";
import RealtimeFilterBar from "@/components/filters/realtime-filter-bar";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

import {
  createInventoryTransferAction,
  postInventoryTransferAction,
} from "./actions";

export const metadata = {
  title: "Stock Transfer | HEXACORE ERP",
  description: "Transfer persediaan antar gudang",
};

type SearchParams = Promise<{
  error?: string;
  created?: string;
  posted?: string;
  q?: string;
  transfer_status?: string;
  inventory_status?: string;
  source_warehouse?: string;
  destination_warehouse?: string;
}>;

type ProductRow = {
  id: string;
  sku: string;
  product_name: string;
  tracking_type: string;
  unit: string;
  is_active: boolean;
};

type VariantRow = {
  id: string;
  product_id: string;
  variant_sku: string;
  variant_name: string;
  is_active: boolean;
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type UnitRow = {
  id: string;
  product_id: string;
  product_variant_id: string | null;
  warehouse_id: string | null;
  unit_code: string;
  unit_status: string;
  product_unit_identifiers?: {
    identifier_type: string;
    identifier_value: string;
  }[];
};

type MovementRow = {
  id: string;
  movement_group_id: string | null;
  product_id: string;
  product_variant_id: string | null;
  warehouse_id: string;
  product_unit_id: string | null;
  movement_type: string;
  status: string;
  quantity_delta: number;
  inventory_status: string | null;
  source_reference_number: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  damaged: "Damaged",
  repair: "Repair",
  quarantine: "Quarantine (Historis)",
};

const OPERATIONAL_STATUSES = [
  "available",
  "reserved",
  "damaged",
  "repair",
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_reference: "Referensi produk atau gudang tidak valid.",
  same_warehouse: "Gudang asal dan tujuan tidak boleh sama.",
  invalid_quantity: "Quantity transfer tidak valid.",
  invalid_status: "Status persediaan tidak valid.",
  invalid_unit: "Unit produk tidak valid.",
  notes_too_long: "Catatan maksimal 2.000 karakter.",
  permission_denied: "Anda tidak memiliki permission transfer gudang.",
  create_failed: "Gagal membuat draft transfer. Periksa stok dan data produk.",
  invalid_id: "ID transfer tidak valid.",
  post_failed: "Gagal memproses transfer. Periksa stok dan status draft.",
};

function numberFormat(value: number) {
  return Number(value || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 3,
  });
}

function dateFormat(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function trackingLabel(value: string) {
  const labels: Record<string, string> = {
    quantity: "Quantity",
    imei: "IMEI",
    serial: "Serial Number",
  };

  return labels[value] ?? value;
}

function statusClass(status: string) {
  if (status === "posted") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "draft") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "cancelled") {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

async function StockTransferContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("inventory.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="flex flex-1 items-center justify-center p-5">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              Akses Ditolak
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat Stock Transfer.
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

  const [
    productResult,
    warehouseResult,
    unitResult,
    movementResult,
    variantResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, product_name, tracking_type, unit, is_active")
      .order("sku", { ascending: true }),

    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("is_active", true)
      .order("warehouse_name", { ascending: true }),

    supabase
      .from("product_units")
      .select(`
        id,
        product_id,
        product_variant_id,
        warehouse_id,
        unit_code,
        unit_status,
        product_unit_identifiers (
          identifier_type,
          identifier_value
        )
      `)
      .not("warehouse_id", "is", null)
      .order("unit_code", { ascending: true }),

    supabase
      .from("inventory_movements")
      .select(`
        id,
        movement_group_id,
        product_id,
        product_variant_id,
        warehouse_id,
        product_unit_id,
        movement_type,
        status,
        quantity_delta,
        inventory_status,
        source_reference_number,
        notes,
        created_at
      `)
      .in("movement_type", ["transfer_out", "transfer_in"])
      .order("created_at", { ascending: false })
      .limit(2000),

    supabase
      .from("product_variants")
      .select("id, product_id, variant_sku, variant_name, is_active")
      .order("variant_sku", { ascending: true }),
  ]);

  const hasError =
    productResult.error ||
    warehouseResult.error ||
    unitResult.error ||
    movementResult.error ||
    variantResult.error;

  if (hasError) {
    console.error("Stock Transfer query failed:", {
      product: productResult.error,
      warehouse: warehouseResult.error,
      unit: unitResult.error,
      movement: movementResult.error,
      variant: variantResult.error,
    });

    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Stock Transfer
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat membaca produk, gudang, unit,
              atau riwayat transfer.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const products = (productResult.data ?? []) as ProductRow[];
  const warehouses = (warehouseResult.data ?? []) as WarehouseRow[];
  const units = (unitResult.data ?? []) as unknown as UnitRow[];
  const movements = (movementResult.data ?? []) as MovementRow[];
  const variantRows = (variantResult.data ?? []) as VariantRow[];
  const variants = variantRows.flatMap((variant) => {
    const product = products.find((item) => item.id === variant.product_id);
    if (!product) return [];
    return [{ ...variant, product_name: product.product_name, tracking_type: product.tracking_type }];
  });
  const activeVariants = variants.filter((variant) => variant.is_active && products.some((product) => product.id === variant.product_id && product.is_active));

  const productMap = new Map(
    products.map((item) => [item.id, item])
  );
  const variantMap = new Map(variants.map((item) => [item.id, item]));

  const warehouseMap = new Map(
    warehouses.map((item) => [item.id, item])
  );

  const inboundMap = new Map(
    movements
      .filter((item) => item.movement_type === "transfer_in")
      .map((item) => [item.movement_group_id, item])
  );

  const transfers = movements
    .filter(
      (item) =>
        item.movement_type === "transfer_out" &&
        item.movement_group_id
    )
    .map((outbound) => {
      const inbound = inboundMap.get(
        outbound.movement_group_id
      );

      const product = productMap.get(outbound.product_id);
      const variant = outbound.product_variant_id
        ? variantMap.get(outbound.product_variant_id)
        : undefined;

      const sourceWarehouse = warehouseMap.get(
        outbound.warehouse_id
      );

      const destinationWarehouse = inbound
        ? warehouseMap.get(inbound.warehouse_id)
        : undefined;

      return {
        id: outbound.movement_group_id!,
        reference: outbound.source_reference_number ?? "-",
        product,
        variant,
        sourceWarehouse,
        destinationWarehouse,
        quantity: Math.abs(Number(outbound.quantity_delta)),
        inventoryStatus: outbound.inventory_status ?? "-",
        productUnitId: outbound.product_unit_id,
        status: outbound.status,
        notes: outbound.notes,
        createdAt: outbound.created_at,
        consistent:
          !!inbound &&
          inbound.status === outbound.status &&
          inbound.product_id === outbound.product_id &&
          inbound.product_variant_id === outbound.product_variant_id &&
          (outbound.status !== "draft" || Boolean(outbound.product_variant_id)) &&
          inbound.quantity_delta === -outbound.quantity_delta &&
          inbound.inventory_status === outbound.inventory_status &&
          inbound.product_unit_id === outbound.product_unit_id &&
          inbound.warehouse_id !== outbound.warehouse_id,
      };
    });

  const keyword = (params.q ?? "").trim().slice(0, 100).toLowerCase();
  const transferStatusValues = ["draft", "posted", "cancelled"] as const;
  const transferStatus = transferStatusValues.includes(
    params.transfer_status as (typeof transferStatusValues)[number]
  )
    ? params.transfer_status!
    : "";
  const inventoryStatus = Object.keys(STATUS_LABELS).includes(
    params.inventory_status ?? ""
  )
    ? params.inventory_status!
    : "";
  const sourceWarehouse = warehouses.some(
    (warehouse) => warehouse.id === params.source_warehouse
  )
    ? params.source_warehouse!
    : "";
  const destinationWarehouse = warehouses.some(
    (warehouse) => warehouse.id === params.destination_warehouse
  )
    ? params.destination_warehouse!
    : "";

  const unitMap = new Map(units.map((unit) => [unit.id, unit]));

  const filteredTransfers = transfers.filter((transfer) => {
    if (transferStatus && transfer.status !== transferStatus) return false;
    if (
      inventoryStatus &&
      transfer.inventoryStatus !== inventoryStatus
    ) return false;
    if (
      sourceWarehouse &&
      transfer.sourceWarehouse?.id !== sourceWarehouse
    ) return false;
    if (
      destinationWarehouse &&
      transfer.destinationWarehouse?.id !== destinationWarehouse
    ) return false;

    if (!keyword) return true;

    const registeredUnit = transfer.productUnitId
      ? unitMap.get(transfer.productUnitId)
      : undefined;
    const identifierText = (registeredUnit?.product_unit_identifiers ?? [])
      .map((identifier) => identifier.identifier_value)
      .join(" ");

    const searchableText = [
      transfer.reference,
      transfer.variant?.variant_sku,
      transfer.product?.sku,
      transfer.product?.product_name,
      transfer.sourceWarehouse?.warehouse_name,
      transfer.sourceWarehouse?.warehouse_code,
      transfer.destinationWarehouse?.warehouse_name,
      transfer.destinationWarehouse?.warehouse_code,
      transfer.inventoryStatus,
      transfer.status,
      transfer.notes,
      registeredUnit?.unit_code,
      identifierText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(keyword);
  });

  const draftCount = transfers.filter(
    (item) => item.status === "draft"
  ).length;

  const postedCount = transfers.filter(
    (item) => item.status === "posted"
  ).length;

  const totalQuantity = transfers
    .filter((item) => item.status === "posted")
    .reduce((sum, item) => sum + item.quantity, 0);

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ??
      "Terjadi kesalahan pada proses transfer."
    : null;

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/inventory"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Inventory
              </Link>
              <span className="text-slate-400">/</span>
              <h1 className="text-2xl font-bold text-slate-900">
                Stock Transfer
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Pemindahan persediaan antar gudang dengan pencatatan
              movement dan valuasi inventory.
            </p>
          </header>

          {params.created === "1" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Draft transfer berhasil dibuat. Saldo belum berubah
              sampai transfer diposting.
            </div>
          )}

          {params.posted === "1" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Transfer berhasil diposting dan saldo persediaan telah
              diperbarui.
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Transfer</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {numberFormat(transfers.length)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Seluruh dokumen transfer
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Draft</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {numberFormat(draftCount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Menunggu posting
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Quantity Dipindahkan
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {numberFormat(totalQuantity)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Dari {numberFormat(postedCount)} transfer posted
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Buat Transfer Gudang
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Draft transfer dibuat tanpa mengubah saldo persediaan.
            </p>

            {warehouses.length < 2 ? (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Transfer memerlukan minimal dua gudang aktif.
                Tambahkan gudang melalui Master Data terlebih dahulu.
              </div>
            ) : variants.length === 0 ? (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Belum tersedia produk aktif untuk ditransfer.
              </div>
            ) : (
              <form
                action={createInventoryTransferAction}
                className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                <div>
                  <label
                    htmlFor="transfer-product"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Produk
                  </label>
                  <select
                    id="transfer-product"
                    name="product_variant_id"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Pilih produk
                    </option>
                    {activeVariants.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product_name} · {product.variant_sku} ({product.variant_name}) -{" "}
                        {trackingLabel(product.tracking_type)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="transfer-source"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Gudang Asal
                  </label>
                  <select
                    id="transfer-source"
                    name="source_warehouse_id"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Pilih gudang asal
                    </option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.warehouse_name} ({warehouse.warehouse_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="transfer-destination"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Gudang Tujuan
                  </label>
                  <select
                    id="transfer-destination"
                    name="destination_warehouse_id"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Pilih gudang tujuan
                    </option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.warehouse_name} ({warehouse.warehouse_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="transfer-status"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Status Persediaan
                  </label>
                  <select
                    id="transfer-status"
                    name="inventory_status"
                    required
                    defaultValue="available"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    {OPERATIONAL_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="transfer-quantity"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Quantity
                  </label>
                  <input
                    id="transfer-quantity"
                    name="quantity"
                    type="number"
                    min="0.001"
                    max="999999999999999"
                    step="0.001"
                    required
                    defaultValue="1"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Untuk produk IMEI, kosongkan unit untuk transfer agregat SKU atau pilih satu unit ber-IMEI (quantity 1). Produk serial selalu wajib memilih unit individual.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="transfer-unit"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Unit IMEI / Serial
                  </label>
                  <select
                    id="transfer-unit"
                    name="product_unit_id"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  >
                    <option value="">
                      Transfer agregat SKU (tanpa IMEI)
                    </option>
                    {units.map((unit) => {
                      const identifiers =
                        unit.product_unit_identifiers ?? [];

                      const identifierText = identifiers
                        .map((item) => item.identifier_value)
                        .join(" / ");

                      const product = productMap.get(unit.product_id);
                      const variant = unit.product_variant_id
                        ? variantMap.get(unit.product_variant_id)
                        : undefined;
                      const warehouse = unit.warehouse_id
                        ? warehouseMap.get(unit.warehouse_id)
                        : undefined;

                      return (
                        <option key={unit.id} value={unit.id}>
                          {variant?.variant_sku ?? `${product?.sku ?? unit.unit_code} · Variant belum teridentifikasi`}
                          {" - "}
                          {unit.unit_code}
                          {identifierText
                            ? ` - ${identifierText}`
                            : ""}
                          {" - "}
                          {warehouse?.warehouse_name ?? "Gudang tidak diketahui"}
                          {" - "}
                          {STATUS_LABELS[unit.unit_status] ?? unit.unit_status}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Pilih unit untuk memindahkan satu unit ber-IMEI/serial. Kosongkan pilihan untuk memindahkan stok agregat SKU (hanya untuk produk IMEI dan quantity).
                  </p>
                </div>

                <div className="md:col-span-2 xl:col-span-3">
                  <label
                    htmlFor="transfer-notes"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Catatan
                  </label>
                  <textarea
                    id="transfer-notes"
                    name="notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="Keterangan atau alasan transfer..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </div>

                <div className="md:col-span-2 xl:col-span-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Buat Draft Transfer
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Riwayat Transfer Gudang
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Menampilkan {filteredTransfers.length.toLocaleString("id-ID")} dari maksimal 2.000 transfer terbaru.
              </p>
            </div>

            <div className="border-b border-slate-200 p-5">
              <RealtimeFilterBar
                key={[
                  keyword,
                  transferStatus,
                  inventoryStatus,
                  sourceWarehouse,
                  destinationWarehouse,
                ].join("|")}
                initialKeyword={keyword}
                searchLabel="Cari Riwayat Transfer"
                searchPlaceholder="Referensi, SKU, produk, gudang, IMEI, serial..."
                helperText="Pencarian dan seluruh filter diterapkan otomatis tanpa tombol."
                filters={[
                  {
                    param: "transfer_status",
                    label: "Status Transfer",
                    initialValue: transferStatus,
                    options: [
                      { value: "", label: "Semua Status Transfer" },
                      { value: "draft", label: "Draft" },
                      { value: "posted", label: "Posted" },
                      { value: "cancelled", label: "Cancelled" },
                    ],
                  },
                  {
                    param: "inventory_status",
                    label: "Status Persediaan",
                    initialValue: inventoryStatus,
                    options: [
                      { value: "", label: "Semua Status Persediaan" },
                      ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ],
                  },
                  {
                    param: "source_warehouse",
                    label: "Gudang Asal",
                    initialValue: sourceWarehouse,
                    options: [
                      { value: "", label: "Semua Gudang Asal" },
                      ...warehouses.map((warehouse) => ({
                        value: warehouse.id,
                        label: warehouse.warehouse_name,
                      })),
                    ],
                  },
                  {
                    param: "destination_warehouse",
                    label: "Gudang Tujuan",
                    initialValue: destinationWarehouse,
                    options: [
                      { value: "", label: "Semua Gudang Tujuan" },
                      ...warehouses.map((warehouse) => ({
                        value: warehouse.id,
                        label: warehouse.warehouse_name,
                      })),
                    ],
                  },
                ]}
              />
            </div>

            {filteredTransfers.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  {transfers.length === 0
                    ? "Belum Ada Transfer"
                    : "Transfer Tidak Ditemukan"}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {transfers.length === 0
                    ? "Draft transfer yang dibuat akan muncul di sini."
                    : "Ubah kata kunci atau pilihan filter untuk melihat hasil lain."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      {[
                        "Referensi",
                        "Produk",
                        "Gudang Asal",
                        "Gudang Tujuan",
                        "Quantity",
                        "Status Stok",
                        "Status Transfer",
                        "Tanggal",
                        "Tindakan",
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
                    {filteredTransfers.map((transfer) => (
                      <tr
                        key={transfer.id}
                        className="hover:bg-blue-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {transfer.reference}
                          </p>
                          {!transfer.consistent && (
                            <p className="mt-1 text-xs text-red-600">
                              Pasangan movement tidak konsisten
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {transfer.product?.product_name ?? "Produk tidak ditemukan"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {transfer.variant?.variant_sku ?? (transfer.product?.sku ? `${transfer.product.sku} · Legacy tanpa Variant` : "Variant tidak teridentifikasi")}
                          </p>
                          {transfer.product && (
                            <p className="mt-1 text-xs text-slate-400">
                              {trackingLabel(transfer.product.tracking_type)}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {transfer.sourceWarehouse?.warehouse_name ?? "-"}
                        </td>

                        <td className="px-4 py-4">
                          {transfer.destinationWarehouse?.warehouse_name ?? "-"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                          {numberFormat(transfer.quantity)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          {STATUS_LABELS[transfer.inventoryStatus] ??
                            transfer.inventoryStatus}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                              transfer.status
                            )}`}
                          >
                            {transfer.status.toUpperCase()}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                          {dateFormat(transfer.createdAt)}
                        </td>

                        <td className="px-4 py-4">
                          {transfer.status === "draft" &&
                          transfer.consistent ? (
                            <form action={postInventoryTransferAction}>
                              <input
                                type="hidden"
                                name="movement_group_id"
                                value={transfer.id}
                              />
                              <button
                                type="submit"
                                className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Posting Transfer
                              </button>
                            </form>
                          ) : transfer.status === "posted" ? (
                            <span className="text-xs font-medium text-emerald-700">
                              Selesai
                            </span>
                          ) : (
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
            )}
          </section>

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="font-semibold text-blue-900">
              Informasi Proses Transfer
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-blue-900">
              <li>
                Pembuatan draft tidak mengurangi saldo gudang asal.
              </li>
              <li>
                Posting memproses transfer keluar dan transfer masuk
                secara atomik melalui database.
              </li>
              <li>
                Produk IMEI/serial harus dipindahkan satu unit
                dengan identitas yang valid.
              </li>
              <li>
                Transfer hanya dapat diposting jika stok sumber
                mencukupi dan pasangan movement valid.
              </li>
            </ul>
          </section>

        </div>
      </main>
    </div>
  );
}

export default function StockTransferPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Stock Transfer...
          </p>
        </main>
      }
    >
      <StockTransferContent searchParams={searchParams} />
    </Suspense>
  );
}
