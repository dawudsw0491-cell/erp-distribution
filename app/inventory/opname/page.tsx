
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

import { createStockOpnameAction } from "./actions";

export const metadata = {
  title: "Stock Opname | HEXACORE ERP",
  description: "Penghitungan dan rekonsiliasi persediaan",
};

type SearchParams = Promise<{
  error?: string;
  created?: string;
}>;

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type SessionRow = {
  id: string;
  opname_number: string;
  warehouse_id: string;
  status: string;
  snapshot_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  posted_at: string | null;
  created_by: string;
  created_at: string;
  notes: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  counting: "Sedang Dihitung",
  review: "Menunggu Review",
  approved: "Disetujui",
  posted: "Posted",
  cancelled: "Dibatalkan",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  counting: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  posted: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const ERROR_MESSAGES: Record<string, string> = {
  permission_denied: "Anda tidak memiliki permission Stock Opname.",
  invalid_warehouse: "Gudang yang dipilih tidak valid.",
  notes_too_long: "Catatan maksimal 2.000 karakter.",
  create_failed: "Gagal membuat sesi Stock Opname.",
  invalid_id: "ID sesi Stock Opname tidak valid.",
};

function dateFormat(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortId(value: string) {
  return value ? `${value.slice(0, 8)}...` : "-";
}

async function StockOpnameContent({
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
              Anda tidak memiliki permission untuk melihat Stock Opname.
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

  const [warehouseResult, sessionResult] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("is_active", true)
      .order("warehouse_name", { ascending: true }),

    supabase
      .from("stock_opname_sessions")
      .select(`
        id,
        opname_number,
        warehouse_id,
        status,
        snapshot_at,
        started_at,
        submitted_at,
        approved_at,
        posted_at,
        created_by,
        created_at,
        notes
      `)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (warehouseResult.error || sessionResult.error) {
    console.error("Stock Opname query failed:", {
      warehouse: warehouseResult.error,
      sessions: sessionResult.error,
    });

    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/inventory" />
        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Stock Opname
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat membaca data gudang atau sesi opname.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const warehouses = (warehouseResult.data ?? []) as WarehouseRow[];
  const sessions = (sessionResult.data ?? []) as SessionRow[];

  const warehouseMap = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse])
  );

  const draftCount = sessions.filter(
    (item) => item.status === "draft"
  ).length;

  const countingCount = sessions.filter(
    (item) => item.status === "counting"
  ).length;

  const reviewCount = sessions.filter(
    (item) => item.status === "review"
  ).length;

  const approvedCount = sessions.filter(
    (item) => item.status === "approved"
  ).length;

  const postedCount = sessions.filter(
    (item) => item.status === "posted"
  ).length;

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ??
      "Terjadi kesalahan pada proses Stock Opname."
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
                Stock Opname
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-600">
              Penghitungan fisik, pemeriksaan selisih, approval,
              dan rekonsiliasi persediaan per gudang.
            </p>
          </header>

          {params.created === "1" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Sesi Stock Opname berhasil dibuat. Silakan buka sesi
              untuk memulai penghitungan.
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Sesi</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {sessions.length.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Maksimal 500 sesi terbaru
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Draft</p>
              <p className="mt-2 text-2xl font-bold text-slate-700">
                {draftCount.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Belum dimulai
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Penghitungan</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {countingCount.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Proses pencatatan fisik
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Menunggu Review</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {reviewCount.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Menunggu persetujuan
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Selesai Posting</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {postedCount.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {approvedCount.toLocaleString("id-ID")} sesi approved
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Buat Sesi Stock Opname
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Pilih gudang untuk membuat dokumen penghitungan persediaan.
            </p>

            {warehouses.length === 0 ? (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Belum tersedia gudang aktif. Tambahkan gudang melalui
                Master Data terlebih dahulu.
              </div>
            ) : (
              <form
                action={createStockOpnameAction}
                className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
              >
                <div>
                  <label
                    htmlFor="opname-warehouse"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Gudang
                  </label>

                  <select
                    id="opname-warehouse"
                    name="warehouse_id"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Pilih gudang
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
                    htmlFor="opname-notes"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Catatan
                  </label>

                  <input
                    id="opname-notes"
                    name="notes"
                    type="text"
                    maxLength={2000}
                    placeholder="Contoh: Stock opname periode November"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Buat Sesi Stock Opname
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Daftar Sesi Stock Opname
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Riwayat sesi opname berdasarkan waktu pembuatan.
              </p>
            </div>

            {sessions.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <h3 className="font-semibold text-slate-800">
                  Belum Ada Sesi Stock Opname
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Buat sesi pertama melalui formulir di atas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      {[
                        "Nomor Opname",
                        "Gudang",
                        "Status",
                        "Pembuat",
                        "Tanggal Dibuat",
                        "Snapshot",
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
                    {sessions.map((session) => {
                      const warehouse = warehouseMap.get(
                        session.warehouse_id
                      );

                      return (
                        <tr
                          key={session.id}
                          className="hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-4 py-4">
                            <p className="font-semibold text-slate-900">
                              {session.opname_number}
                            </p>
                            {session.notes && (
                              <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                                {session.notes}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-800">
                              {warehouse?.warehouse_name ?? "Gudang tidak ditemukan"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {warehouse?.warehouse_code ?? "-"}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                                STATUS_CLASSES[session.status] ??
                                "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {STATUS_LABELS[session.status] ??
                                session.status}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {shortId(session.created_by)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {dateFormat(session.created_at)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {dateFormat(session.snapshot_at)}
                          </td>

                          <td className="px-4 py-4">
                            <Link
                              href={`/inventory/opname/${session.id}`}
                              className="inline-flex whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Buka Detail
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="font-semibold text-blue-900">
              Alur Pengendalian Stock Opname
            </h2>

            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-blue-900">
              <li>Buat sesi berdasarkan gudang.</li>
              <li>Mulai sesi untuk mengambil snapshot persediaan.</li>
              <li>Catat hasil penghitungan fisik.</li>
              <li>Review seluruh selisih persediaan.</li>
              <li>Ajukan dan lakukan approval oleh pengguna berbeda.</li>
              <li>Posting hasil opname ke inventory.</li>
            </ol>
          </section>

        </div>
      </main>
    </div>
  );
}

export default function StockOpnamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Stock Opname...
          </p>
        </main>
      }
    >
      <StockOpnameContent searchParams={searchParams} />
    </Suspense>
  );
}
