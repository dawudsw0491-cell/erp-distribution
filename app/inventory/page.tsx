
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Inventory Dashboard | HEXACORE ERP",
  description: "Dashboard pengelolaan persediaan HEXACORE ERP",
};

type BalanceRow = {
  product_variant_id: string;
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

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  );
}

async function InventoryContent() {
  await connection();

  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("inventory.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/inventory" />

        <main className="flex flex-1 items-center justify-center p-5">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Akses Ditolak
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat persediaan.
              Silakan hubungi administrator sistem.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [
    balanceResult,
    warehouseResult,
    variantResult,
    movementResult,
  ] = await Promise.all([
    supabase
      .from("inventory_balances")
      .select(
        `
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
        `
      ),

    supabase
      .from("warehouses")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted"),
  ]);

  const hasError =
    balanceResult.error ||
    warehouseResult.error ||
    variantResult.error ||
    movementResult.error;

  if (hasError) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Inventory Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Data persediaan tidak dapat diambil. Periksa konfigurasi
              database dan permission akses Inventory.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const balances = (balanceResult.data ?? []) as BalanceRow[];

  const summary = balances.reduce(
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

  const menuItems = [
    {
      title: "Stock Balance",
      description: "Saldo persediaan per produk dan gudang.",
      href: "/inventory/balances",
    },
    {
      title: "Stock Movement",
      description: "Riwayat barang masuk dan keluar.",
      href: "/inventory/movements",
    },
    {
      title: "IMEI Registry",
      description: "Pelacakan unit berdasarkan IMEI dan serial.",
      href: "/inventory/units",
    },
    {
      title: "Stock Transfer",
      description: "Pemindahan persediaan antar gudang.",
      href: "/inventory/transfers",
    },
    {
      title: "Stock Opname",
      description: "Pemeriksaan fisik dan pencocokan stok.",
      href: "/inventory/opname",
    },
    {
      title: "Stock Adjustment",
      description: "Penyesuaian saldo persediaan.",
      href: "/inventory/adjustments",
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/inventory" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <h1 className="text-2xl font-bold text-slate-900">
              Inventory Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Monitoring persediaan barang seluruh gudang perusahaan.
            </p>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total SKU Tersedia"
              value={formatNumber(balances.length)}
              description="Jumlah kombinasi produk dan gudang yang memiliki saldo."
            />
            <MetricCard
              label="Total On Hand"
              value={formatNumber(summary.onHand)}
              description="Seluruh unit dalam kategori persediaan."
            />
            <MetricCard
              label="Gudang Aktif"
              value={formatNumber(warehouseResult.count ?? 0)}
              description="Jumlah gudang yang aktif."
            />
            <MetricCard
              label="Nilai Persediaan"
              value={formatCurrency(summary.value)}
              description="Nilai persediaan berdasarkan valuasi inventory."
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="font-semibold text-slate-900">
                Komposisi Persediaan
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Distribusi stok berdasarkan status inventory.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Available",
                  value: summary.available,
                  color: "text-emerald-700",
                },
                {
                  label: "Reserved",
                  value: summary.reserved,
                  color: "text-blue-700",
                },
                {
                  label: "Quarantine",
                  value: summary.quarantine,
                  color: "text-amber-700",
                },
                {
                  label: "Damaged",
                  value: summary.damaged,
                  color: "text-red-700",
                },
                {
                  label: "Repair",
                  value: summary.repair,
                  color: "text-purple-700",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${item.color}`}>
                    {formatNumber(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-900">
                Akses Modul Inventory
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pilih aktivitas pengelolaan persediaan.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <h3 className="font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.description}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-blue-700">
                    Buka Modul →
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Informasi Sistem Inventory
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="text-slate-600">
                Varian Produk Aktif:
                <strong className="ml-2 text-slate-900">
                  {formatNumber(variantResult.count ?? 0)}
                </strong>
              </div>
              <div className="text-slate-600">
                Transaksi Posted:
                <strong className="ml-2 text-slate-900">
                  {formatNumber(movementResult.count ?? 0)}
                </strong>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Inventory Dashboard...
          </p>
        </main>
      }
    >
      <InventoryContent />
    </Suspense>
  );
}
