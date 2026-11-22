import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Laporan Operasional | HEXA CORE ERP",
  description: "Laporan operasional Purchasing dan Inventory",
};

type SearchParams = Promise<{ from?: string; to?: string }>;
type SupabaseServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

type PurchaseRow = {
  id: string;
  po_number: string;
  order_date: string;
  status: string;
  grand_total: number | string;
  warehouse_id: string;
};

type ReceiptRow = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  status: string;
  warehouse_id: string;
};

type MovementRow = {
  id: string;
  source_reference_number: string | null;
  movement_type: string;
  quantity_delta: number | string;
  posted_at: string | null;
  warehouse_id: string;
};

type BalanceRow = {
  id: string;
  warehouse_id: string;
  on_hand_quantity: number | string;
  inventory_value: number | string;
};

type OpnameRow = {
  id: string;
  opname_number: string;
  status: string;
  created_at: string;
  warehouse_id: string;
};

function isValidDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function getJakartaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function getAllowedWarehouseIds(
  supabase: SupabaseServerClient,
  warehouseIds: string[]
) {
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  const checks = await Promise.all(
    uniqueIds.map(async (warehouseId) => {
      const { data, error } = await supabase.rpc("has_warehouse_access", {
        target_warehouse_id: warehouseId,
      });
      return !error && data === true ? warehouseId : null;
    })
  );

  return new Set(
    checks.filter((id): id is string => typeof id === "string")
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const [reportsAccess, purchasingAccess, inventoryAccess] = await Promise.all([
    getAuthorizationContext("reports.view"),
    getAuthorizationContext("purchasing.view"),
    getAuthorizationContext("inventory.view"),
  ]);

  if (!reportsAccess.user) redirect("/login");

  if (!reportsAccess.profile || !reportsAccess.authorized) {
    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/reports" />
        <main className="flex flex-1 items-center justify-center p-6">
          <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Akses Laporan Ditolak</h1>
            <p className="mt-3 text-sm text-slate-600">
              Akun ini tidak memiliki permission reports.view.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const today = getJakartaToday();
  const defaultFrom = today.slice(0, 7) + "-01";
  let dateFrom = isValidDate(params.from) ? params.from : defaultFrom;
  let dateTo = isValidDate(params.to) ? params.to : today;

  if (dateFrom > dateTo) {
    dateFrom = defaultFrom;
    dateTo = today;
  }

  const fromTimestamp = dateFrom + "T00:00:00+07:00";
  const toExclusive = new Date(
    new Date(dateTo + "T00:00:00+07:00").getTime() + 86400000
  ).toISOString();

  const supabase = reportsAccess.supabase;

  let purchaseOrders: PurchaseRow[] = [];
  let receipts: ReceiptRow[] = [];
  let purchaseError = false;

  if (purchasingAccess.authorized) {
    const [poResult, receiptResult] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("id,po_number,order_date,status,grand_total,warehouse_id")
        .gte("order_date", dateFrom)
        .lte("order_date", dateTo)
        .order("order_date", { ascending: false })
        .limit(100),
      supabase
        .from("goods_receipts")
        .select("id,receipt_number,receipt_date,status,warehouse_id")
        .gte("receipt_date", dateFrom)
        .lte("receipt_date", dateTo)
        .order("receipt_date", { ascending: false })
        .limit(100),
    ]);

    purchaseError = Boolean(poResult.error || receiptResult.error);
    purchaseOrders = (poResult.data ?? []) as PurchaseRow[];
    receipts = (receiptResult.data ?? []) as ReceiptRow[];
  }

  let movements: MovementRow[] = [];
  let balances: BalanceRow[] = [];
  let opnameSessions: OpnameRow[] = [];
  let inventoryError = false;

  if (inventoryAccess.authorized) {
    const [movementResult, balanceResult, opnameResult] = await Promise.all([
      supabase
        .from("inventory_movements")
        .select(
          "id,source_reference_number,movement_type,quantity_delta,posted_at,warehouse_id"
        )
        .eq("status", "posted")
        .gte("posted_at", fromTimestamp)
        .lt("posted_at", toExclusive)
        .order("posted_at", { ascending: false })
        .limit(100),
      supabase
        .from("inventory_balances")
        .select("id,warehouse_id,on_hand_quantity,inventory_value")
        .limit(1000),
      supabase
        .from("stock_opname_sessions")
        .select("id,opname_number,status,created_at,warehouse_id")
        .gte("created_at", fromTimestamp)
        .lt("created_at", toExclusive)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    inventoryError = Boolean(
      movementResult.error || balanceResult.error || opnameResult.error
    );
    movements = (movementResult.data ?? []) as MovementRow[];
    balances = (balanceResult.data ?? []) as BalanceRow[];
    opnameSessions = (opnameResult.data ?? []) as OpnameRow[];
  }

  const warehouseIds = [
    ...purchaseOrders.map((row) => row.warehouse_id),
    ...receipts.map((row) => row.warehouse_id),
    ...movements.map((row) => row.warehouse_id),
    ...balances.map((row) => row.warehouse_id),
    ...opnameSessions.map((row) => row.warehouse_id),
  ];

  const allowedWarehouseIds = await getAllowedWarehouseIds(
    supabase,
    warehouseIds
  );

  const inAllowedWarehouses = <T extends { warehouse_id: string }>(rows: T[]) =>
    rows.filter((row) => allowedWarehouseIds.has(row.warehouse_id));

  purchaseOrders = inAllowedWarehouses(purchaseOrders);
  receipts = inAllowedWarehouses(receipts);
  movements = inAllowedWarehouses(movements);
  balances = inAllowedWarehouses(balances);
  opnameSessions = inAllowedWarehouses(opnameSessions);

  const totalOnHand = balances.reduce(
    (sum, row) => sum + Number(row.on_hand_quantity || 0),
    0
  );
  const totalInventoryValue = balances.reduce(
    (sum, row) => sum + Number(row.inventory_value || 0),
    0
  );
  const displayedMovementQuantity = movements.reduce(
    (sum, row) => sum + Number(row.quantity_delta || 0),
    0
  );

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/reports" />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Business Intelligence
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Laporan Operasional
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Ringkasan Purchasing dan Inventory berdasarkan sumber transaksi aktual.
            </p>
          </header>

          <form
            method="get"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Dari tanggal
              <input
                type="date"
                name="from"
                value={dateFrom}
                max={dateTo}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Sampai tanggal
              <input
                type="date"
                name="to"
                value={dateTo}
                min={dateFrom}
                max={today}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Terapkan Periode
            </button>
            <p className="text-xs text-slate-500">
              Periode menggunakan zona waktu Asia/Jakarta. Maksimal 100 dokumen per sumber.
            </p>
          </form>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Purchase Order ditampilkan</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {purchasingAccess.authorized ? formatNumber(purchaseOrders.length) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Maksimal 100 dokumen pada periode</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Goods Receipt ditampilkan</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {purchasingAccess.authorized ? formatNumber(receipts.length) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Maksimal 100 dokumen pada periode</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Mutasi posted ditampilkan</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {inventoryAccess.authorized ? formatNumber(movements.length) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Net kuantitas: {inventoryAccess.authorized ? formatNumber(displayedMovementQuantity) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Nilai persediaan saat ini</p>
              <p className="mt-2 break-words text-xl font-bold text-slate-900">
                {inventoryAccess.authorized ? formatCurrency(totalInventoryValue) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                On Hand: {inventoryAccess.authorized ? formatNumber(totalOnHand) : "—"}
              </p>
            </div>
          </section>

          {purchaseError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Sebagian sumber Purchasing tidak dapat dimuat. Angka yang tampil tidak boleh dianggap sebagai total lengkap.
            </p>
          )}
          {inventoryError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Sebagian sumber Inventory tidak dapat dimuat. Angka yang tampil tidak boleh dianggap sebagai total lengkap.
            </p>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              title="Laporan Purchase Order"
              description="Dokumen pembelian berdasarkan tanggal order dan warehouse yang dapat diakses."
            />
            {!purchasingAccess.authorized ? (
              <EmptyState message="Permission purchasing.view tidak tersedia untuk akun ini." />
            ) : purchaseOrders.length === 0 ? (
              <EmptyState message="Tidak ada Purchase Order pada periode dan warehouse yang dapat diakses." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Nomor PO</th>
                      <th className="px-3 py-3">Tanggal</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-medium text-slate-900">{row.po_number}</td>
                        <td className="px-3 py-3 text-slate-600">{formatDate(row.order_date)}</td>
                        <td className="px-3 py-3 text-slate-600">{row.status}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-900">{formatCurrency(row.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              title="Laporan Goods Receipt"
              description="Penerimaan barang yang tercatat pada periode terpilih."
            />
            {!purchasingAccess.authorized ? (
              <EmptyState message="Permission purchasing.view tidak tersedia untuk akun ini." />
            ) : receipts.length === 0 ? (
              <EmptyState message="Tidak ada Goods Receipt pada periode dan warehouse yang dapat diakses." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Nomor GR</th>
                      <th className="px-3 py-3">Tanggal</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipts.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-medium text-slate-900">{row.receipt_number}</td>
                        <td className="px-3 py-3 text-slate-600">{formatDate(row.receipt_date)}</td>
                        <td className="px-3 py-3 text-slate-600">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              title="Laporan Inventory Movement"
              description="Hanya pergerakan berstatus posted yang dihitung sebagai transaksi inventory."
            />
            {!inventoryAccess.authorized ? (
              <EmptyState message="Permission inventory.view tidak tersedia untuk akun ini." />
            ) : movements.length === 0 ? (
              <EmptyState message="Tidak ada mutasi posted pada periode dan warehouse yang dapat diakses." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Referensi</th>
                      <th className="px-3 py-3">Tanggal Posting</th>
                      <th className="px-3 py-3">Jenis</th>
                      <th className="px-3 py-3 text-right">Kuantitas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-medium text-slate-900">{row.source_reference_number || row.id.slice(0, 8)}</td>
                        <td className="px-3 py-3 text-slate-600">{formatDate(row.posted_at)}</td>
                        <td className="px-3 py-3 text-slate-600">{row.movement_type}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-900">{formatNumber(row.quantity_delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              title="Stock Opname"
              description="Sesi stock opname yang dibuat pada periode terpilih."
            />
            {!inventoryAccess.authorized ? (
              <EmptyState message="Permission inventory.view tidak tersedia untuk akun ini." />
            ) : opnameSessions.length === 0 ? (
              <EmptyState message="Tidak ada sesi stock opname pada periode dan warehouse yang dapat diakses." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Nomor Opname</th>
                      <th className="px-3 py-3">Tanggal Dibuat</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {opnameSessions.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-medium text-slate-900">{row.opname_number}</td>
                        <td className="px-3 py-3 text-slate-600">{formatDate(row.created_at)}</td>
                        <td className="px-3 py-3 text-slate-600">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Laporan ini bersifat operasional dan read-only. Data Penjualan, Retur, Piutang, dan Akuntansi belum ditampilkan karena sumber transaksi otoritatifnya belum tersedia.
          </p>
        </div>
      </main>
    </div>
  );
}
