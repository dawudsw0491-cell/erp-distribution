
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import QuantityCountForm from "./QuantityCountForm";
import UnitCountForm from "./UnitCountForm";
import {
  startStockOpnameAction,
  submitStockOpnameReviewAction,
  approveStockOpnameAction,
  postStockOpnameAction,
  cancelStockOpnameAction,
} from "../actions";

export const metadata = {
  title: "Detail Stock Opname | HEXACORE ERP",
  description: "Detail dan proses stock opname gudang",
};

type SearchParams = Promise<{
  error?: string;
  created?: string;
  started?: string;
  counted?: string;
  unit_counted?: string;
  submitted?: string;
  approved?: string;
  posted?: string;
  cancelled?: string;
}>;

type PageParams = Promise<{
  id: string;
}>;

type SessionRow = {
  id: string;
  opname_number: string;
  warehouse_id: string;
  status: string;
  snapshot_at: string;
  started_at: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type OpnameItemRow = {
  id: string;
  session_id: string;
  product_variant_id: string;
  inventory_status: string;
  snapshot_quantity: number;
  counted_quantity: number | null;
  variance_quantity: number | null;
  snapshot_average_unit_cost: number;
  snapshot_inventory_value: number;
  notes: string | null;
  counted_by: string | null;
  counted_at: string | null;
  product_variants: {
    id: string;
    variant_sku: string;
    variant_name: string;
    products: {
      sku: string;
      product_name: string;
      tracking_type: string;
      unit: string;
    } | null;
  } | null;
};

type ProductUnitRow = {
  id: string;
  product_variant_id: string;
  warehouse_id: string | null;
  unit_code: string;
  unit_status: string;
  product_unit_identifiers?: {
    identifier_type: string;
    identifier_value: string;
  }[];
};

type UnitCountRow = {
  id: string;
  opname_item_id: string;
  product_unit_id: string;
  is_present: boolean;
  observed_status: string | null;
  notes: string | null;
  counted_by: string | null;
  counted_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  quarantine: "Quarantine",
  damaged: "Damaged",
  repair: "Repair",
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  counting: "Sedang Dihitung",
  review: "Menunggu Persetujuan",
  approved: "Disetujui",
  posted: "Posted",
  cancelled: "Dibatalkan",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_id: "ID Stock Opname tidak valid.",
  permission_denied: "Anda tidak memiliki permission Stock Opname.",
  start_failed: "Gagal memulai Stock Opname.",
  invalid_quantity: "Quantity hasil hitung tidak valid.",
  notes_too_long: "Catatan maksimal 2.000 karakter.",
  count_failed: "Gagal menyimpan hasil hitung quantity.",
  unit_count_failed: "Gagal menyimpan hasil hitung IMEI/serial.",
  submit_failed:
    "Gagal mengajukan Stock Opname. Pastikan seluruh item sudah dihitung.",
  approve_failed:
    "Gagal menyetujui Stock Opname. Periksa hak akses dan status dokumen.",
  post_failed:
    "Gagal melakukan posting. Periksa kembali kondisi saldo dan hasil opname.",
  invalid_reason: "Alasan pembatalan wajib diisi.",
  cancel_failed: "Gagal membatalkan Stock Opname.",
};

function numberFormat(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("id-ID", {
    maximumFractionDigits: 3,
  });
}

function currencyFormat(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

function dateFormat(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    counting: "bg-blue-100 text-blue-700",
    review: "bg-amber-100 text-amber-700",
    approved: "bg-indigo-100 text-indigo-700",
    posted: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return classes[status] ?? "bg-slate-100 text-slate-700";
}

function varianceClass(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-700";
}

function trackingLabel(value: string) {
  const labels: Record<string, string> = {
    quantity: "Quantity",
    imei: "IMEI",
    serial: "Serial Number",
  };

  return labels[value] ?? value;
}

function identifierText(unit: ProductUnitRow) {
  const identifiers = unit.product_unit_identifiers ?? [];

  if (identifiers.length === 0) return "-";

  return identifiers
    .map(
      (item) =>
        `${item.identifier_type}: ${item.identifier_value}`
    )
    .join(" | ");
}

async function StockOpnameDetailContent({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

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
              Anda tidak memiliki permission untuk melihat Stock Opname.
            </p>
            <Link
              href="/inventory"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Kembali ke Inventory
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const opnameAuthorization =
    await getAuthorizationContext("inventory.opname");

  const canManageOpname =
    !!opnameAuthorization.user &&
    !!opnameAuthorization.profile &&
    opnameAuthorization.authorized;

  const sessionResult = await supabase
    .from("stock_opname_sessions")
    .select(`
      id,
      opname_number,
      warehouse_id,
      status,
      snapshot_at,
      started_at,
      submitted_at,
      approved_by,
      approved_at,
      posted_by,
      posted_at,
      cancelled_by,
      cancelled_at,
      notes,
      created_by,
      created_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (sessionResult.error) {
    console.error(
      "Stock Opname session query failed:",
      sessionResult.error
    );
  }

  if (!sessionResult.data) {
    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8">
            <h1 className="text-xl font-bold text-slate-900">
              Stock Opname Tidak Ditemukan
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Dokumen tidak ditemukan atau Anda tidak memiliki akses
              untuk membacanya.
            </p>
            <Link
              href="/inventory/opname"
              className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Kembali ke Daftar Stock Opname
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const session = sessionResult.data as SessionRow;

  // Memeriksa status Owner melalui fungsi database yang sama
  // dengan yang digunakan oleh approve_stock_opname.
  const { data: ownerCheckData, error: ownerCheckError } =
    await supabase.rpc("is_owner");

  if (ownerCheckError) {
    console.error(
      "Stock Opname owner check failed:",
      ownerCheckError
    );
  }

  const isOwner = ownerCheckData === true;

  // Owner boleh menyetujui dokumennya sendiri.
  // Pengguna non-Owner tetap mengikuti maker-checker.
  const canApproveOpname =
    canManageOpname &&
    (session.created_by !== user.id || isOwner);

  const [
    warehouseResult,
    itemResult,
  ] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("id", session.warehouse_id)
      .maybeSingle(),

    supabase
      .from("stock_opname_items")
      .select(`
        id,
        session_id,
        product_variant_id,
        inventory_status,
        snapshot_quantity,
        counted_quantity,
        variance_quantity,
        snapshot_average_unit_cost,
        snapshot_inventory_value,
        notes,
        counted_by,
        counted_at,
        product_variants!inner (
          id,
          variant_sku,
          variant_name,
          products!inner (
            sku,
            product_name,
            tracking_type,
            unit
          )
        )
      `)
      .eq("session_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (warehouseResult.error || itemResult.error) {
    console.error("Stock Opname detail query failed:", {
      warehouse: warehouseResult.error,
      items: itemResult.error,
    });

    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Detail Stock Opname
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat membaca gudang atau item opname.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const warehouse =
    warehouseResult.data as WarehouseRow | null;

  const items =
    (itemResult.data ?? []) as unknown as OpnameItemRow[];

  const itemIds = items.map((item) => item.id);

  const [
    unitResult,
    countResult,
  ] = await Promise.all([
    supabase
      .from("product_units")
      .select(`
        id,
        product_variant_id,
        warehouse_id,
        unit_code,
        unit_status,
        product_unit_identifiers (
          identifier_type,
          identifier_value
        )
      `)
      .eq("warehouse_id", session.warehouse_id)
      .order("unit_code", { ascending: true }),

    itemIds.length > 0
      ? supabase
          .from("stock_opname_unit_counts")
          .select(`
            id,
            opname_item_id,
            product_unit_id,
            is_present,
            observed_status,
            notes,
            counted_by,
            counted_at
          `)
          .in("opname_item_id", itemIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ]);

  if (unitResult.error || countResult.error) {
    console.error("Stock Opname unit query failed:", {
      units: unitResult.error,
      counts: countResult.error,
    });

    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Data Unit
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat membaca data IMEI, serial,
              atau hasil pencatatan unit.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const units =
    (unitResult.data ?? []) as unknown as ProductUnitRow[];

  const unitCounts =
    (countResult.data ?? []) as UnitCountRow[];

  const countMap = new Map(
    unitCounts.map((item) => [
      `${item.opname_item_id}:${item.product_unit_id}`,
      item,
    ])
  );

  const isCounting = session.status === "counting";
  const isDraft = session.status === "draft";
  const isReview = session.status === "review";
  const isApproved = session.status === "approved";
  const isPosted = session.status === "posted";
  const isCancelled = session.status === "cancelled";

  const totalSnapshot = items.reduce(
    (sum, item) => sum + Number(item.snapshot_quantity ?? 0),
    0
  );

  const totalCounted = items.reduce(
    (sum, item) => sum + Number(item.counted_quantity ?? 0),
    0
  );

  const totalVariance = items.reduce(
    (sum, item) => sum + Number(item.variance_quantity ?? 0),
    0
  );

  const countedItemCount = items.filter(
    (item) => item.counted_quantity !== null
  ).length;

  const pendingItemCount = items.length - countedItemCount;

  const errorMessage = query.error
    ? ERROR_MESSAGES[query.error] ??
      "Terjadi kesalahan pada proses Stock Opname."
    : null;

  const successMessages: Record<string, string> = {
    created: "Draft Stock Opname berhasil dibuat.",
    started:
      "Stock Opname berhasil dimulai. Snapshot persediaan telah dibuat.",
    counted: "Hasil hitung quantity berhasil disimpan.",
    unit_counted: "Hasil pencatatan unit berhasil disimpan.",
    submitted: "Stock Opname berhasil diajukan untuk persetujuan.",
    approved: "Stock Opname berhasil disetujui.",
    posted:
      "Stock Opname berhasil diposting. Saldo inventory telah diperbarui sesuai kebijakan posting.",
    cancelled: "Stock Opname berhasil dibatalkan.",
  };

  const successKey = Object.keys(successMessages).find(
    (key) => query[key as keyof typeof query] === "1"
  );

  const successMessage = successKey
    ? successMessages[successKey]
    : null;

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/inventory"
                className="font-medium text-blue-700 hover:underline"
              >
                Inventory
              </Link>
              <span className="text-slate-400">/</span>
              <Link
                href="/inventory/opname"
                className="font-medium text-blue-700 hover:underline"
              >
                Stock Opname
              </Link>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">
                Detail
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {session.opname_number}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Detail pemeriksaan fisik persediaan gudang.
                </p>
              </div>

              <span
                className={`inline-flex rounded-full px-4 py-2 text-xs font-bold ${statusClass(
                  session.status
                )}`}
              >
                {SESSION_STATUS_LABELS[session.status] ??
                  session.status.toUpperCase()}
              </span>
            </div>
          </header>

          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Total Item Snapshot
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {numberFormat(items.length)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kombinasi varian dan status stok
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Snapshot Quantity
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {numberFormat(totalSnapshot)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Posisi saat opname dimulai
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Item Sudah Dihitung
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {numberFormat(countedItemCount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {numberFormat(pendingItemCount)} item belum selesai
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Total Selisih
              </p>
              <p
                className={`mt-2 text-2xl font-bold ${varianceClass(
                  totalVariance
                )}`}
              >
                {totalVariance > 0 ? "+" : ""}
                {numberFormat(totalVariance)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Berdasarkan item yang telah dihitung
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Informasi Stock Opname
              </h2>

              <Link
                href="/inventory/opname"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Kembali ke Daftar
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Gudang
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {warehouse?.warehouse_name ?? "-"}
                </p>
                <p className="text-xs text-slate-500">
                  {warehouse?.warehouse_code ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Waktu Snapshot
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.snapshot_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Dibuat Pada
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.created_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Mulai Penghitungan
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.started_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Diajukan untuk Persetujuan
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.submitted_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Disetujui Pada
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.approved_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Diposting Pada
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.posted_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Dibatalkan Pada
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {dateFormat(session.cancelled_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Catatan Sesi
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                  {session.notes || "-"}
                </p>
              </div>
            </div>
          </section>

          {isDraft && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-900">
                Draft Stock Opname
              </h2>
              <p className="mt-2 text-sm text-blue-800">
                Mulai penghitungan untuk mengambil snapshot saldo
                persediaan gudang. Snapshot menjadi dasar perbandingan
                hasil fisik.
              </p>

              {canManageOpname ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={startStockOpnameAction}>
                    <input
                      type="hidden"
                      name="session_id"
                      value={session.id}
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Mulai Stock Opname
                    </button>
                  </form>

                  <form
                    action={cancelStockOpnameAction}
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      type="hidden"
                      name="session_id"
                      value={session.id}
                    />
                    <input
                      type="text"
                      name="reason"
                      required
                      maxLength={2000}
                      placeholder="Alasan pembatalan"
                      className="min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Batalkan
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-4 text-sm text-amber-800">
                  Anda hanya memiliki akses melihat. Permission
                  inventory.opname diperlukan untuk menjalankan proses.
                </p>
              )}
            </section>
          )}

          {isCounting && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-900">
                Proses Penghitungan Aktif
              </h2>
              <p className="mt-2 text-sm text-blue-800">
                Masukkan jumlah fisik untuk produk quantity atau
                catat keberadaan setiap unit terdaftar untuk produk
                IMEI/serial.
              </p>

              {!canManageOpname && (
                <p className="mt-3 text-sm font-medium text-amber-800">
                  Anda tidak memiliki permission untuk mengubah hasil
                  penghitungan.
                </p>
              )}
            </section>
          )}

          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Detail Item Penghitungan
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Data snapshot dikelompokkan berdasarkan varian produk
                dan status persediaan.
              </p>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  Belum Ada Item Snapshot
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Mulai Stock Opname untuk membentuk snapshot persediaan.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const variant = item.product_variants;
                const product = variant?.products;
                const trackingType = product?.tracking_type ?? "quantity";

                const snapshotQuantity = Number(
                  item.snapshot_quantity ?? 0
                );

                const countedQuantity =
                  item.counted_quantity === null
                    ? null
                    : Number(item.counted_quantity);

                const variance =
                  item.variance_quantity === null
                    ? null
                    : Number(item.variance_quantity);

                const itemUnits = units.filter(
                  (unit) =>
                    unit.product_variant_id ===
                      item.product_variant_id &&
                    unit.unit_status === item.inventory_status
                );

                const isSerialized =
                  trackingType === "imei" ||
                  trackingType === "serial";

                const countedUnits = itemUnits.filter((unit) =>
                  countMap.has(`${item.id}:${unit.id}`)
                ).length;

                const presentUnits = itemUnits.filter((unit) => {
                  const count = countMap.get(
                    `${item.id}:${unit.id}`
                  );

                  return count?.is_present === true;
                }).length;

                const itemIsCounted =
                  countedQuantity !== null;

                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {product?.product_name ?? "Produk tidak ditemukan"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {variant?.variant_name ?? "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            SKU Produk: {product?.sku ?? "-"}
                            {" | "}
                            SKU Varian: {variant?.variant_sku ?? "-"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                            {trackingLabel(trackingType)}
                          </span>
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                            {STATUS_LABELS[item.inventory_status] ??
                              item.inventory_status}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              itemIsCounted
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {itemIsCounted ? "Sudah Dihitung" : "Belum Dihitung"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs text-slate-500">
                          Snapshot Quantity
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {numberFormat(snapshotQuantity)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Hasil Hitung
                        </p>
                        <p className="mt-1 text-lg font-bold text-blue-700">
                          {countedQuantity === null
                            ? "-"
                            : numberFormat(countedQuantity)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Selisih
                        </p>
                        <p
                          className={`mt-1 text-lg font-bold ${
                            variance === null
                              ? "text-slate-400"
                              : varianceClass(variance)
                          }`}
                        >
                          {variance === null
                            ? "-"
                            : `${variance > 0 ? "+" : ""}${numberFormat(variance)}`}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Nilai Snapshot
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {currencyFormat(item.snapshot_inventory_value)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Rata-rata biaya:{" "}
                          {currencyFormat(item.snapshot_average_unit_cost)}
                        </p>
                      </div>
                    </div>

                    {isSerialized ? (
                      <div className="border-t border-slate-200 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-slate-900">
                              Daftar Unit IMEI / Serial
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {numberFormat(countedUnits)} dari{" "}
                              {numberFormat(itemUnits.length)} unit telah dicatat.
                            </p>
                          </div>

                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            Terdata hadir: {numberFormat(presentUnits)}
                          </span>
                        </div>

                        {itemUnits.length === 0 ? (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            Tidak ditemukan unit terdaftar pada gudang
                            dengan status persediaan ini. Unit fisik
                            tambahan harus diregistrasikan terlebih dahulu
                            sebelum dapat direkonsiliasi melalui opname.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {itemUnits.map((unit) => {
                              const existingCount = countMap.get(
                                `${item.id}:${unit.id}`
                              );

                              return (
                                <div
                                  key={unit.id}
                                  className="rounded-lg border border-slate-200 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold text-slate-900">
                                        {unit.unit_code}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {identifierText(unit)}
                                      </p>
                                    </div>

                                    <span
                                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        existingCount
                                          ? existingCount.is_present
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-red-100 text-red-700"
                                          : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {!existingCount
                                        ? "Belum Dicatat"
                                        : existingCount.is_present
                                          ? "Ditemukan"
                                          : "Tidak Ditemukan"}
                                    </span>
                                  </div>

                                  {existingCount?.notes && (
                                    <p className="mt-2 text-xs text-slate-600">
                                      Catatan: {existingCount.notes}
                                    </p>
                                  )}

                                  {isCounting && canManageOpname && (
                                    <UnitCountForm
                                      sessionId={session.id}
                                      itemId={item.id}
                                      productUnitId={unit.id}
                                      isPresent={
                                        existingCount?.is_present ?? true
                                      }
                                      observedStatus={
                                        existingCount?.observed_status ??
                                        item.inventory_status
                                      }
                                      notes={existingCount?.notes ?? ""}
                                      statusOptions={Object.entries(
                                        STATUS_LABELS
                                      ).map(([value, label]) => ({
                                        value,
                                        label,
                                      }))}
                                    />
                                  )}

                                  {existingCount?.counted_at && (
                                    <p className="mt-2 text-xs text-slate-400">
                                      Dicatat:{" "}
                                      {dateFormat(existingCount.counted_at)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-t border-slate-200 p-5">
                        <h4 className="font-semibold text-slate-900">
                          Penghitungan Quantity
                        </h4>

                        {isCounting && canManageOpname ? (
                          <QuantityCountForm
                            sessionId={session.id}
                            itemId={item.id}
                            countedQuantity={countedQuantity}
                            notes={item.notes ?? ""}
                            unit={product?.unit ?? "-"}
                          />
                        ) : (
                          <div className="mt-3 rounded-lg bg-slate-50 p-4">
                            <p className="text-sm text-slate-700">
                              Hasil hitung:{" "}
                              <strong>
                                {countedQuantity === null
                                  ? "Belum dihitung"
                                  : `${numberFormat(countedQuantity)} ${product?.unit ?? ""}`}
                              </strong>
                            </p>
                            {item.notes && (
                              <p className="mt-2 text-xs text-slate-500">
                                Catatan: {item.notes}
                              </p>
                            )}
                            {item.counted_at && (
                              <p className="mt-2 text-xs text-slate-400">
                                Dicatat: {dateFormat(item.counted_at)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>

          {isCounting && canManageOpname && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">
                Penyelesaian Penghitungan
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Pengajuan Stock Opname akan memvalidasi kelengkapan
                semua item dan pencatatan unit IMEI/serial. Pengajuan
                tidak mengubah saldo inventory.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <form action={submitStockOpnameReviewAction}>
                  <input
                    type="hidden"
                    name="session_id"
                    value={session.id}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Ajukan Stock Opname
                  </button>
                </form>

                <form
                  action={cancelStockOpnameAction}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    type="hidden"
                    name="session_id"
                    value={session.id}
                  />
                  <input
                    type="text"
                    name="reason"
                    required
                    maxLength={2000}
                    placeholder="Alasan pembatalan"
                    className="min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Batalkan Opname
                  </button>
                </form>
              </div>
            </section>
          )}

          {isReview && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-900">
                Menunggu Persetujuan
              </h2>
              <p className="mt-2 text-sm text-amber-800">
                Hasil penghitungan telah diajukan. Periksa hasil
                penghitungan, kemudian klik Setujui Stock Opname
                untuk melanjutkan proses.
              </p>

              {canApproveOpname && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={approveStockOpnameAction}>
                    <input
                      type="hidden"
                      name="session_id"
                      value={session.id}
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Setujui Stock Opname
                    </button>
                  </form>

                  <form
                    action={cancelStockOpnameAction}
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      type="hidden"
                      name="session_id"
                      value={session.id}
                    />
                    <input
                      type="text"
                      name="reason"
                      required
                      maxLength={2000}
                      placeholder="Alasan pembatalan"
                      className="min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Batalkan
                    </button>
                  </form>
                </div>
              )}

              {!canApproveOpname && canManageOpname && (
                <p className="mt-4 rounded-lg border border-amber-300 bg-white p-3 text-sm text-amber-800">
                  Pembuat Stock Opname hanya dapat menyetujui
                  dokumennya sendiri jika memiliki hak Owner.
                  Pengguna non-Owner harus menggunakan akun approver lain.
                </p>
              )}

              {!canManageOpname && (
                <p className="mt-4 text-sm text-amber-800">
                  Anda memiliki akses melihat, tetapi tidak memiliki
                  permission untuk menyetujui Stock Opname.
                </p>
              )}
            </section>
          )}

          {isApproved && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="font-semibold text-emerald-900">
                Stock Opname Telah Disetujui
              </h2>
              <p className="mt-2 text-sm text-emerald-800">
                Hasil opname sudah disetujui dan siap diposting.
                Posting akan menerapkan penyesuaian inventory sesuai
                kebijakan sistem.
              </p>

              {canManageOpname && (
                <form action={postStockOpnameAction} className="mt-4">
                  <input
                    type="hidden"
                    name="session_id"
                    value={session.id}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Posting Stock Opname
                  </button>
                </form>
              )}
            </section>
          )}

          {isPosted && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="font-semibold text-emerald-900">
                Stock Opname Selesai
              </h2>
              <p className="mt-2 text-sm text-emerald-800">
                Dokumen telah diposting. Data hasil opname ditampilkan
                sebagai riwayat final dan tidak dapat diubah melalui
                halaman ini.
              </p>
            </section>
          )}

          {isCancelled && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-semibold text-red-900">
                Stock Opname Dibatalkan
              </h2>
              <p className="mt-2 text-sm text-red-800">
                Dokumen ini telah dibatalkan dan hanya dapat dilihat
                sebagai riwayat.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="font-semibold text-blue-900">
              Kebijakan dan Informasi Stock Opname
            </h2>

            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-blue-900">
              <li>
                Snapshot dibuat ketika sesi Stock Opname dimulai dan
                menjadi dasar pembanding hasil hitung fisik.
              </li>
              <li>
                Penghitungan quantity dilakukan berdasarkan varian
                produk dan status persediaan.
              </li>
              <li>
                Produk IMEI/serial diperiksa berdasarkan unit yang
                sudah terdaftar pada sistem.
              </li>
              <li>
                Unit IMEI/serial yang tidak ditemukan dicatat sebagai
                hasil pemeriksaan, tetapi tidak otomatis diubah menjadi
                status sold atau dihapus dari registri.
              </li>
              <li>
                Posting quantity memperbarui saldo dan valuasi inventory
                melalui fungsi database yang telah disiapkan.
              </li>
              <li>
                Posting produk IMEI/serial saat ini bersifat konservatif:
                hasil pemeriksaan dicatat tanpa otomatis mengubah saldo
                atau status unit.
              </li>
              <li>
                Owner dapat menyetujui dokumen yang dibuatnya sendiri.
                Pengguna non-Owner tetap mengikuti aturan pemisahan tugas.
              </li>
            </ul>
          </section>

          <div className="pb-4 text-xs text-slate-400">
            HEXACORE ERP · Inventory Management · Stock Opname
          </div>
        </div>
      </main>
    </div>
  );
}

export default function StockOpnameDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Detail Stock Opname...
          </p>
        </main>
      }
    >
      <StockOpnameDetailContent
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
