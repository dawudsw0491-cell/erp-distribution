
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import DashboardClock from "@/components/layout/dashboard-clock";

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
};

type PurchaseOrderActivityRow = {
  id: string;
  po_number: string;
  status: string;
  warehouse_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
};

type GoodsReceiptActivityRow = {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  warehouse_id: string;
  posted_at: string;
  created_at: string;
};

type InventoryMovementActivityRow = {
  id: string;
  warehouse_id: string;
  movement_type: string;
  source_reference_type: string | null;
  source_reference_number: string | null;
  posted_at: string;
  created_at: string;
};

type ScopedActivityRow =
  | ({ kind: "purchase_order" } & PurchaseOrderActivityRow)
  | ({ kind: "goods_receipt" } & GoodsReceiptActivityRow)
  | ({ kind: "inventory_movement" } & InventoryMovementActivityRow);

type ActivityRecord = {
  id: string;
  occurredAt: string;
  source: string;
  activity: string;
  reference: string;
  status: string;
  href: string;
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function filterActivityByWarehouseAccess<T extends { warehouse_id: string }>(
  supabase: Awaited<ReturnType<typeof getAuthorizationContext>>["supabase"],
  rows: T[]
): Promise<{ rows: T[]; hasError: boolean }> {
  const warehouseIds = [...new Set(rows.map((row) => row.warehouse_id))];

  const accessChecks = await Promise.all(
    warehouseIds.map(async (warehouseId) => {
      const { data, error } = await supabase.rpc("has_warehouse_access", {
        target_warehouse_id: warehouseId,
      });

      return {
        warehouseId,
        allowed: !error && data === true,
        hasError: Boolean(error),
      };
    })
  );

  const allowedWarehouseIds = new Set(
    accessChecks
      .filter((check) => check.allowed)
      .map((check) => check.warehouseId)
  );

  return {
    rows: rows.filter((row) => allowedWarehouseIds.has(row.warehouse_id)),
    hasError: accessChecks.some((check) => check.hasError),
  };
}

function getPurchaseOrderActivityStatus(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Diajukan",
    approved: "Disetujui",
    rejected: "Ditolak",
    partially_received: "Diterima Sebagian",
    received: "Selesai Diterima",
    cancelled: "Dibatalkan",
  };

  return labels[status] ?? status;
}

function getInventoryMovementActivityLabel(movementType: string) {
  const labels: Record<string, string> = {
    purchase: "Penerimaan Pembelian",
    sale: "Pengeluaran Penjualan",
    transfer_in: "Transfer Masuk",
    transfer_out: "Transfer Keluar",
    adjustment: "Penyesuaian Stok",
    customer_return: "Retur Pelanggan",
    supplier_return: "Retur Supplier",
    opening_balance: "Saldo Awal",
    status_change: "Perubahan Status Stok",
  };

  return labels[movementType] ?? movementType;
}

async function DashboardContent() {
  await connection();

  // Jalankan pemeriksaan permission secara paralel agar waktu tunggu tidak
  // menumpuk untuk setiap modul dashboard.
  const [
    dashboardAccess,
    masterAccess,
    inventoryAccess,
    purchasingAccess,
  ] = await Promise.all([
    getAuthorizationContext("dashboard.view"),
    getAuthorizationContext("master.view"),
    getAuthorizationContext("inventory.view"),
    getAuthorizationContext("purchasing.view"),
  ]);

  const { user, profile, authorized, supabase } = dashboardAccess;

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/80 bg-gradient-to-br from-white via-sky-50 to-blue-100 p-8 text-center shadow-[0_15px_35px_rgba(37,99,235,0.16)]">
          <div className="mb-4 text-4xl text-red-500">!</div>
          <h1 className="text-xl font-bold text-slate-800">
            Akses Dashboard Ditolak
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Profil pengguna tidak aktif atau Anda tidak memiliki hak akses
            untuk membuka Dashboard. Silakan hubungi administrator sistem.
          </p>
        </div>
      </main>
    );
  }

  // Status server ini hanya menyatakan bahwa request Dashboard sedang diproses.
  // Koneksi database diverifikasi melalui pembacaan profil pengguna yang sedang login.
  const databaseHealthProbe = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const databaseConnected =
    !databaseHealthProbe.error && databaseHealthProbe.data?.id === user.id;
  const databaseHealthStatus = databaseHealthProbe.error
    ? "Gagal"
    : databaseConnected
      ? "Terhubung"
      : "Tidak terverifikasi";

  const systemHealthItems = [
    {
      label: "Status Server",
      icon: "▤",
      value: "Merespons",
      tone: "ok" as const,
    },
    {
      label: "Koneksi Database",
      icon: "▥",
      value: databaseHealthStatus,
      tone: databaseConnected
        ? "ok" as const
        : databaseHealthProbe.error
          ? "error" as const
          : "warning" as const,
    },
    {
      label: "Backup Terakhir",
      icon: "◷",
      value: "Tidak tersedia",
      tone: "warning" as const,
    },
    {
      label: "Uptime Sistem",
      icon: "↗",
      value: "Tidak tersedia",
      tone: "warning" as const,
    },
  ];

  const systemConditionLabel = databaseConnected
    ? "Operasional terbatas"
    : "Perlu pemeriksaan";
  const systemConditionNote = databaseConnected
    ? "Server merespons dan database berhasil diperiksa pada request ini. Backup serta uptime belum memiliki sumber telemetry."
    : databaseHealthProbe.error
      ? "Query pemeriksaan database gagal. Periksa koneksi database dan akses tabel profil."
      : "Baris profil pengguna tidak dapat diverifikasi melalui query database.";

  const displayName =
    profile.full_name?.trim() || user.email || "Pengguna";

  const initial = displayName.charAt(0).toUpperCase();

  // Product KPI mengikuti permission dan statistik resmi Master Data.

  let totalProductCount: number | null = null;
  let productLoadError = false;

  if (
    masterAccess.user &&
    masterAccess.profile &&
    masterAccess.authorized
  ) {
    const productStatisticsResult =
      await masterAccess.supabase.rpc("get_product_statistics");

    if (productStatisticsResult.error) {
      productLoadError = true;
    } else {
      totalProductCount = Number(
        productStatisticsResult.data?.[0]?.total_products ?? 0
      );
    }
  }

  // INVENTORY OVERVIEW ACCESS


  let inventoryData:
    | {
        balances: BalanceRow[];
        warehouseCount: number | null;
        variantCount: number | null;
        postedMovementCount: number | null;
      }
    | null = null;

  let inventoryLoadError = false;
  let masterReferenceLoadError = false;

  if (
    inventoryAccess.user &&
    inventoryAccess.profile &&
    inventoryAccess.authorized
  ) {
    const balanceResult = await inventoryAccess.supabase
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
        inventory_value
      `);

    let warehouseCount: number | null = null;
    let variantCount: number | null = null;
    let activeWarehouseIds: string[] | null = null;

    // Warehouse dan Product Variant memakai policy master.view di live DB.
    // Jangan menjalankannya melalui context inventory.view karena RLS dapat
    // mengembalikan hitungan nol yang sebenarnya hanya tidak terlihat.
    if (masterAccess.authorized) {
      const [warehouseResult, variantResult] = await Promise.all([
        masterAccess.supabase
          .from("warehouses")
          .select("id", { count: "exact" })
          .eq("is_active", true),

        masterAccess.supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      ]);

      if (warehouseResult.error || variantResult.error) {
        masterReferenceLoadError = true;
      } else {
        warehouseCount = warehouseResult.count ?? 0;
        activeWarehouseIds = (warehouseResult.data ?? []).map(
          (warehouse) => warehouse.id
        );
        variantCount = variantResult.count ?? 0;
      }
    }

    if (balanceResult.error) {
      inventoryLoadError = true;
    } else {
      const visibleBalanceRows = (balanceResult.data ?? []) as BalanceRow[];
      const candidateWarehouseIds = masterAccess.authorized
        ? activeWarehouseIds
        : [...new Set(visibleBalanceRows.map((row) => row.warehouse_id))];

      let postedMovementCount: number | null = null;

      if (candidateWarehouseIds !== null) {
        const warehouseScopeCheck = await filterActivityByWarehouseAccess(
          inventoryAccess.supabase,
          candidateWarehouseIds.map((warehouseId) => ({
            warehouse_id: warehouseId,
          }))
        );

        if (!warehouseScopeCheck.hasError) {
          const visibleWarehouseIds = warehouseScopeCheck.rows.map(
            (row) => row.warehouse_id
          );

          if (visibleWarehouseIds.length === 0) {
            postedMovementCount = 0;
          } else {
            const movementCountResult = await inventoryAccess.supabase
              .from("inventory_movements")
              .select("id", { count: "exact", head: true })
              .eq("status", "posted")
              .in("warehouse_id", visibleWarehouseIds);

            if (!movementCountResult.error) {
              postedMovementCount = movementCountResult.count ?? 0;
            }
          }
        }
      }

      inventoryData = {
        balances: visibleBalanceRows,
        warehouseCount,
        variantCount,
        postedMovementCount,
      };
    }
  }

  const balances = inventoryData?.balances ?? [];

  const inventorySummary = balances.reduce(
    (result, row) => {
      result.available += Number(row.available_quantity || 0);
      result.reserved += Number(row.reserved_quantity || 0);
      result.quarantine += Number(row.quarantine_quantity || 0);
      result.damaged += Number(row.damaged_quantity || 0);
      result.repair += Number(row.repair_quantity || 0);
      result.onHand += Number(row.on_hand_quantity || 0);
      result.value += Number(row.inventory_value || 0);
      return result;
    },
    {
      available: 0,
      reserved: 0,
      quarantine: 0,
      damaged: 0,
      repair: 0,
      onHand: 0,
      value: 0,
    }
  );

  // Live inventory_balances menyimpan identitas produk pada product_id.
  // product_variant_id tetap dibaca sebagai fallback untuk baris historis.
  const totalInventorySku = new Set(
    balances
      .map((row) => row.product_id ?? row.product_variant_id)
      .filter((id): id is string => Boolean(id))
  ).size;

  // BUSINESS ACTIVITY FEED
  // Purchase Order dan Goods Receipt menggunakan permission Purchasing yang sama.
  // Reuse satu authorization context agar tidak melakukan query permission ganda.

  const goodsReceiptAccess = purchasingAccess;

  const purchasingActivityAuthorized = Boolean(
    purchasingAccess.user &&
      purchasingAccess.profile &&
      purchasingAccess.authorized
  );
  const goodsReceiptActivityAuthorized = Boolean(
    goodsReceiptAccess.user &&
      goodsReceiptAccess.profile &&
      goodsReceiptAccess.authorized
  );
  const inventoryActivityAuthorized = Boolean(
    inventoryAccess.user &&
      inventoryAccess.profile &&
      inventoryAccess.authorized
  );

  const [
    purchaseOrderActivityResult,
    goodsReceiptActivityResult,
    inventoryMovementActivityResult,
  ] = await Promise.all([
    purchasingActivityAuthorized
      ? (async () => {
          const { data, error } = await purchasingAccess.supabase
            .from("purchase_orders")
            .select(`
              id,
              po_number,
              status,
              warehouse_id,
              created_at,
              updated_at,
              submitted_at,
              approved_at,
              rejected_at,
              cancelled_at
            `)
            .neq("status", "draft")
            .order("updated_at", { ascending: false })
            .limit(12);

          return {
            rows: error ? [] : (data ?? []) as PurchaseOrderActivityRow[],
            hasError: Boolean(error),
          };
        })()
      : Promise.resolve({
          rows: [] as PurchaseOrderActivityRow[],
          hasError: false,
        }),
    goodsReceiptActivityAuthorized
      ? (async () => {
          const { data, error } = await goodsReceiptAccess.supabase
            .from("goods_receipts")
            .select("id, receipt_number, purchase_order_id, warehouse_id, posted_at, created_at")
            .eq("status", "posted")
            .not("posted_at", "is", null)
            .order("posted_at", { ascending: false })
            .limit(12);

          return {
            rows: error ? [] : (data ?? []) as GoodsReceiptActivityRow[],
            hasError: Boolean(error),
          };
        })()
      : Promise.resolve({
          rows: [] as GoodsReceiptActivityRow[],
          hasError: false,
        }),
    inventoryActivityAuthorized
      ? (async () => {
          const { data, error } = await inventoryAccess.supabase
            .from("inventory_movements")
            .select(`
              id,
              warehouse_id,
              movement_type,
              source_reference_type,
              source_reference_number,
              posted_at,
              created_at
            `)
            .eq("status", "posted")
            .not("posted_at", "is", null)
            .order("posted_at", { ascending: false })
            .limit(12);

          return {
            rows: error ? [] : (data ?? []) as InventoryMovementActivityRow[],
            hasError: Boolean(error),
          };
        })()
      : Promise.resolve({
          rows: [] as InventoryMovementActivityRow[],
          hasError: false,
        }),
  ]);

  const authorizedActivitySourceCount = [
    purchasingActivityAuthorized,
    goodsReceiptActivityAuthorized,
    inventoryActivityAuthorized,
  ].filter(Boolean).length;

  const sourceActivityLoadErrors = [
    ...(purchaseOrderActivityResult.hasError ? ["Purchase Order"] : []),
    ...(goodsReceiptActivityResult.hasError ? ["Goods Receipt"] : []),
    ...(inventoryMovementActivityResult.hasError ? ["Inventory Movement"] : []),
  ];

  const candidateActivityRows: ScopedActivityRow[] = [
    ...purchaseOrderActivityResult.rows.map((row) => ({
      ...row,
      kind: "purchase_order" as const,
    })),
    ...goodsReceiptActivityResult.rows.map((row) => ({
      ...row,
      kind: "goods_receipt" as const,
    })),
    ...inventoryMovementActivityResult.rows.map((row) => ({
      ...row,
      kind: "inventory_movement" as const,
    })),
  ];

  // RPC per warehouse dijalankan dengan identitas pengguna yang sedang login.
  // Jika pemeriksaan gagal, baris ditolak (fail closed), tidak ditampilkan.
  const {
    rows: visibleActivityRows,
    hasError: warehouseAccessCheckFailed,
  } = await filterActivityByWarehouseAccess(
    inventoryAccess.supabase,
    candidateActivityRows
  );

  const activityLoadErrors = [
    ...sourceActivityLoadErrors,
    ...(warehouseAccessCheckFailed ? ["Pemeriksaan Akses Gudang"] : []),
  ];

  const activityItems: ActivityRecord[] = visibleActivityRows.map((row) => {
    if (row.kind === "purchase_order") {
      return {
        id: `po-${row.id}`,
        occurredAt:
          row.updated_at ??
          row.approved_at ??
          row.submitted_at ??
          row.created_at,
        source: "Purchasing",
        activity: "Purchase Order",
        reference: row.po_number,
        status: getPurchaseOrderActivityStatus(row.status),
        href: `/purchases/${row.id}`,
      };
    }

    if (row.kind === "goods_receipt") {
      return {
        id: `gr-${row.id}`,
        occurredAt: row.posted_at,
        source: "Goods Receipt",
        activity: "Penerimaan Barang",
        reference: row.receipt_number,
        status: "Posted",
        href: `/purchases/${row.purchase_order_id}/goods-receipts/${row.id}`,
      };
    }

    return {
      id: `movement-${row.id}`,
      occurredAt: row.posted_at,
      source: "Inventory",
      activity: getInventoryMovementActivityLabel(row.movement_type),
      reference:
        row.source_reference_number ??
        row.source_reference_type ??
        `MOV-${row.id.slice(0, 8)}`,
      status: "Posted",
      href: "/inventory/movements",
    };
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 10);

  // KPI penjualan dan piutang tidak menampilkan nol sebelum sumber
  // transaksi terposting tersedia. Nilai kosong dibedakan dari nol riil.
  const summaryCards = [
    {
      title: "Total Produk",
      value: !masterAccess.authorized
        ? "—"
        : productLoadError
          ? "Gagal dimuat"
          : formatNumber(totalProductCount ?? 0),
      note: !masterAccess.authorized
        ? "Permission master.view diperlukan"
        : productLoadError
          ? "Statistik produk gagal dimuat"
          : "Produk terdaftar",
      icon: "▦",
    },
    {
      title: "Total Persediaan",
      value: !inventoryAccess.authorized
        ? "—"
        : inventoryLoadError || !inventoryData
          ? "Gagal dimuat"
          : formatNumber(inventorySummary.available),
      note: !inventoryAccess.authorized
        ? "Permission inventory.view diperlukan"
        : inventoryLoadError || !inventoryData
          ? "Saldo persediaan gagal dimuat"
          : "Unit dengan status Available",
      icon: "▣",
    },
    {
      title: "Penjualan Hari Ini",
      value: "—",
      note: "Belum ada sumber penjualan terposting",
      icon: "↗",
    },
    {
      title: "Total Piutang",
      value: "—",
      note: "Buku besar piutang pelanggan belum tersedia",
      icon: "◷",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100 text-slate-800 md:flex">
      <ErpSidebar activePath="/" />

      <main className="min-w-0 flex-1">
        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100/80 bg-gradient-to-r from-white via-white to-sky-50 px-5 py-4 shadow-[0_3px_12px_rgba(37,99,235,0.06)] md:px-8">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ringkasan aktivitas bisnis distribusi handphone
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <DashboardClock />

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {displayName}
                </p>
                <p className="text-xs text-slate-500">
                  Pengguna ERP
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-gradient-to-br from-white to-blue-100 font-bold text-blue-700 shadow-[0_3px_8px_rgba(37,99,235,0.16)]">
                {initial}
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-5 md:p-8">
          {/* WELCOME */}
          <section className="rounded-2xl border border-white/80 bg-gradient-to-r from-white/90 via-sky-50 to-blue-100/70 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)]">
            <h2 className="text-lg font-bold text-slate-800">
              Selamat Datang di ERP Distribution
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pantau operasional, persediaan, penjualan, dan keuangan bisnis Anda.
            </p>
          </section>

          {/* EXISTING ERP SUMMARY */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50 to-blue-100/80 p-5 shadow-[0_8px_20px_rgba(37,99,235,0.10),0_3px_7px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(37,99,235,0.17)]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">
                    {card.title}
                  </p>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-white to-blue-100 text-2xl text-blue-600 shadow-sm">
                    {card.icon}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-bold text-slate-800">
                  {card.value}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {card.note}
                </p>
              </div>
            ))}
          </section>

          {/* NEW INVENTORY OVERVIEW */}
          <section className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50/70 to-blue-50 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Inventory Overview
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ringkasan kondisi persediaan seluruh gudang.
                </p>
              </div>
              <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                Inventory Monitoring
              </span>
            </div>

            {!inventoryAccess.authorized ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Anda tidak memiliki permission untuk melihat ringkasan Inventory.
              </div>
            ) : inventoryLoadError ? (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Data Inventory gagal dimuat. Periksa koneksi database dan permission tabel terkait.
              </div>
            ) : inventoryData ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Total SKU",
                      value: formatNumber(totalInventorySku),
                      note: "Produk unik yang memiliki saldo",
                      href: "/inventory/balances",
                    },
                    {
                      label: "Total On Hand",
                      value: formatNumber(inventorySummary.onHand),
                      note: "Jumlah seluruh bucket status persediaan",
                      href: "/inventory/balances",
                    },
                    {
                      label: "Gudang Aktif",
                      value: !masterAccess.authorized
                        ? "—"
                        : masterReferenceLoadError
                          ? "Gagal dimuat"
                          : formatNumber(inventoryData.warehouseCount ?? 0),
                      note: !masterAccess.authorized
                        ? "Permission master.view diperlukan"
                        : masterReferenceLoadError
                          ? "Data gudang gagal dimuat"
                          : "Gudang berstatus aktif",
                      href: masterAccess.authorized
                        ? "/warehouses"
                        : "/inventory/balances",
                    },
                    {
                      label: "Nilai Persediaan",
                      value: formatCurrency(inventorySummary.value),
                      note: "Total inventory value pada gudang yang dapat diakses",
                      href: "/inventory/balances",
                    },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <p className="text-sm font-medium text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 break-words text-2xl font-bold text-slate-900">
                        {item.value}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {item.note}
                      </p>
                    </Link>
                  ))}
                </div>

                <div className="mt-6">
                  <h3 className="font-semibold text-slate-800">
                    Komposisi Persediaan
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Distribusi kuantitas berdasarkan status inventory.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      {
                        label: "Available",
                        value: inventorySummary.available,
                        color: "text-emerald-700",
                      },
                      {
                        label: "Reserved",
                        value: inventorySummary.reserved,
                        color: "text-blue-700",
                      },
                      {
                        label: "Quarantine",
                        value: inventorySummary.quarantine,
                        color: "text-amber-700",
                      },
                      {
                        label: "Damaged",
                        value: inventorySummary.damaged,
                        color: "text-red-700",
                      },
                      {
                        label: "Repair",
                        value: inventorySummary.repair,
                        color: "text-purple-700",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <p className="text-sm text-slate-500">
                          {item.label}
                        </p>
                        <p className={`mt-2 text-2xl font-bold ${item.color}`}>
                          {formatNumber(item.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Aktivitas Inventory
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {inventoryData.postedMovementCount === null
                        ? "Jumlah movement tidak tersedia untuk lingkup akses ini."
                        : `${formatNumber(inventoryData.postedMovementCount)} transaksi movement berstatus Posted pada gudang yang dapat diakses.`}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {inventoryData.variantCount === null
                        ? masterReferenceLoadError
                          ? "Jumlah varian gagal dimuat."
                          : "Permission master.view diperlukan untuk jumlah varian."
                        : `${formatNumber(inventoryData.variantCount)} varian produk aktif`}
                  </p>
                </div>
              </>
            ) : null}
          </section>

          {/* BUSINESS ACTIVITY AND SYSTEM INFORMATION */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* BUSINESS ACTIVITY */}
            <div className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50/70 to-blue-50 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)] xl:col-span-2">
              <h3 className="font-bold text-slate-800">
                Aktivitas Bisnis
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Purchase Order non-draft, Goods Receipt Posted, dan Inventory Movement Posted
              </p>

              {activityLoadErrors.length > 0 && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Sebagian sumber aktivitas gagal dimuat: {activityLoadErrors.join(", ")}.
                </p>
              )}

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-blue-100 text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Tanggal</th>
                      <th className="pb-3 pr-4 font-medium">Aktivitas</th>
                      <th className="pb-3 pr-4 font-medium">Referensi</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activityItems.length > 0 ? (
                      activityItems.map((item) => (
                        <tr key={item.id} className="align-top hover:bg-blue-50/40">
                          <td className="whitespace-nowrap py-4 pr-4 text-xs text-slate-500">
                            {formatActivityDateTime(item.occurredAt)}
                          </td>
                          <td className="py-4 pr-4">
                            <Link
                              href={item.href}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              {item.activity}
                            </Link>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.source}
                            </p>
                          </td>
                          <td className="py-4 pr-4">
                            <Link
                              href={item.href}
                              className="break-all text-slate-700 hover:text-blue-700 hover:underline"
                            >
                              {item.reference}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap py-4">
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-slate-400">
                          {authorizedActivitySourceCount === 0
                            ? "Tidak ada permission untuk membaca sumber aktivitas bisnis."
                            : activityLoadErrors.length > 0
                              ? "Aktivitas tidak dapat dimuat dari sumber yang diizinkan."
                              : "Belum ada aktivitas terposting pada sumber yang dapat Anda akses."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SYSTEM HEALTH OVERVIEW */}
            <div className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50/70 to-blue-50 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)]">
              <div className="flex items-center gap-3 border-b border-blue-100 pb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 shadow-[0_6px_14px_rgba(5,150,105,0.18)]">
                  <svg
                    viewBox="0 0 64 64"
                    className="h-12 w-12 drop-shadow-[0_5px_4px_rgba(5,100,70,0.3)]"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="System Health"
                    role="img"
                  >
                    <defs>
                      <linearGradient id="healthShield" x1="10" y1="5" x2="52" y2="60">
                        <stop offset="0%" stopColor="#6EE7B7" />
                        <stop offset="50%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#047857" />
                      </linearGradient>
                      <linearGradient id="healthSide" x1="20" y1="20" x2="55" y2="60">
                        <stop offset="0%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#064E3B" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M32 5 L55 14 V30 C55 44 45 54 32 61 C19 54 9 44 9 30 V14 Z"
                      fill="url(#healthSide)"
                      transform="translate(0 2)"
                    />
                    <path
                      d="M32 3 L54 12 V29 C54 42 44 52 32 58 C20 52 10 42 10 29 V12 Z"
                      fill="url(#healthShield)"
                      stroke="#D1FAE5"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M16 15 L32 8 L48 15"
                      stroke="white"
                      strokeOpacity=".55"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20 30 L28 38 L44 22"
                      stroke="white"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    STATUS SISTEM
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Monitoring Layanan DSW
                  </p>
                </div>
              </div>

              {systemHealthItems.map((item) => (
                <div key={item.label} className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <span className="text-lg">{item.icon}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-600">
                      {item.label}
                    </span>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      item.tone === "ok"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : item.tone === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}

              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${databaseConnected ? "text-amber-600" : "text-red-600"}`}>●</span>
                  <span className="text-sm font-bold text-slate-700">
                    Kondisi Sistem: {systemConditionLabel}
                  </span>
                </div>
                <p className="mt-1 pl-6 text-xs text-slate-600">
                  {systemConditionNote}
                </p>
              </div>
            </div>
          </section>

          <footer className="pb-4 text-center text-xs font-medium text-slate-500 drop-shadow-[0_1px_1px_rgba(15,23,42,0.12)]">
            Enterprise Distribution & Workflow Gateway © 2026
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100">
          <p className="text-sm text-slate-500">
            Memuat dashboard...
          </p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
