
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getAuthorizationContext } from "@/lib/auth/authorization";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {
  approvePurchaseOrderAction,
  rejectPurchaseOrderAction,
} from "../actions";

export const instant = false;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    approved?: string;
    rejected?: string;
  }>;
};

type PurchaseOrderDetail = {
  id: string;
  po_number: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  currency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  shipping_cost: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  supplier: {
    supplier_code: string;
    supplier_name: string;
  } | null;
  warehouse: {
    warehouse_code: string;
    warehouse_name: string;
  } | null;
  items: {
    id: string;
    quantity: number;
    received_quantity: number;
    unit_cost: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    notes: string | null;
    variant: {
      variant_sku: string;
      variant_name: string;
      product: {
        sku: string;
        product_name: string;
      } | null;
    } | null;
  }[];
};

type GoodsReceiptSummary = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  status: string;
  posted_at: string | null;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  rejected: "Ditolak",
  partially_received: "Diterima Sebagian",
  received: "Selesai Diterima",
  cancelled: "Dibatalkan",
};

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-indigo-100 text-indigo-700",
  rejected: "bg-red-100 text-red-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatCurrency(
  value: number,
  currency: string
): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "-";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID");
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 sm:text-right">
        {value}
      </span>
    </div>
  );
}

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      id,
      po_number,
      order_date,
      expected_date,
      status,
      currency,
      subtotal,
      discount_amount,
      tax_amount,
      shipping_cost,
      grand_total,
      notes,
      created_at,
      submitted_at,
      approved_at,
      rejected_at,
      rejection_reason,
      supplier:suppliers (
        supplier_code,
        supplier_name
      ),
      warehouse:warehouses (
        warehouse_code,
        warehouse_name
      ),
      items:purchase_order_items (
        id,
        quantity,
        received_quantity,
        unit_cost,
        discount_amount,
        tax_amount,
        line_total,
        notes,
        variant:product_variants (
          variant_sku,
          variant_name,
          product:products (
            sku,
            product_name
          )
        )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Purchase Order detail query failed:", error);
    redirect("/purchases?error=load_failed");
  }

  if (!data) {
    notFound();
  }

  const order = data as unknown as PurchaseOrderDetail;
  const currency = order.currency || "IDR";

  // Ambil riwayat Goods Receipt untuk PO ini.
  const {
    data: receiptData,
    error: receiptError,
  } = await supabase
    .from("goods_receipts")
    .select(`
      id,
      receipt_number,
      receipt_date,
      status,
      posted_at,
      created_at
    `)
    .eq("purchase_order_id", order.id)
    .order("created_at", { ascending: false });

  if (receiptError) {
    console.error(
      "Goods Receipt history query failed:",
      receiptError
    );
  }

  const goodsReceipts =
    (receiptData ?? []) as GoodsReceiptSummary[];

  const totalOrdered = order.items.reduce(
    (total, item) =>
      total + Number(item.quantity || 0),
    0
  );

  const totalReceived = order.items.reduce(
    (total, item) =>
      total + Number(item.received_quantity || 0),
    0
  );

  const totalRemaining = Math.max(
    totalOrdered - totalReceived,
    0
  );

  const canCreateGoodsReceipt =
    ["approved", "partially_received"].includes(order.status) &&
    order.items.some(
      (item) =>
        Number(item.quantity) >
        Number(item.received_quantity)
    );

  return (
    <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/purchases" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-8">
        <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <a
                href="/purchases"
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                ← Kembali ke Pembelian
              </a>

              <h1 className="mt-3 text-2xl font-bold text-slate-900">
                Detail Purchase Order
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Nomor PO: {order.po_number}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canCreateGoodsReceipt && (
                <a
                  href={`/purchases/${order.id}/goods-receipts/new`}
                  className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  + Buat Goods Receipt
                </a>
              )}

              <span
                className={`inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold ${
                  statusStyles[order.status] ||
                  "bg-slate-100 text-slate-700"
                }`}
              >
                {statusLabels[order.status] || order.status}
              </span>
            </div>
          </div>

          {/* Notifikasi */}
          {query.created === "1" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Purchase Order berhasil dibuat dan menunggu keputusan Approval.
            </div>
          )}

          {query.approved === "1" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Purchase Order berhasil disetujui.
            </div>
          )}

          {query.rejected === "1" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Purchase Order berhasil ditolak.
            </div>
          )}

          {query.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {query.error === "approve_failed" &&
                "Approval Purchase Order gagal diproses."}

              {query.error === "reject_failed" &&
                "Penolakan Purchase Order gagal diproses."}

              {query.error === "invalid_rejection_reason" &&
                "Alasan penolakan wajib diisi dan maksimal 1.000 karakter."}

              {query.error === "permission_denied" &&
                "Anda tidak memiliki hak akses untuk melakukan tindakan ini."}

              {![
                "approve_failed",
                "reject_failed",
                "invalid_rejection_reason",
                "permission_denied",
              ].includes(query.error) &&
                "Terjadi kesalahan saat memproses Purchase Order."}
            </div>
          )}

          {/* Approval dan Reject */}
          {order.status === "draft" && (
            <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Keputusan Purchase Order
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Purchase Order ini menunggu keputusan akhir.
                Pilih Approve untuk melanjutkan proses pembelian
                atau Reject untuk menolaknya.
              </p>

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
                <form
                  action={approvePurchaseOrderAction}
                  className="shrink-0"
                >
                  <input
                    type="hidden"
                    name="purchase_order_id"
                    value={order.id}
                  />

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 sm:w-auto"
                  >
                    Approve Purchase Order
                  </button>
                </form>

                <form
                  action={rejectPurchaseOrderAction}
                  className="w-full space-y-2 sm:max-w-xl"
                >
                  <input
                    type="hidden"
                    name="purchase_order_id"
                    value={order.id}
                  />

                  <label
                    htmlFor="rejection_reason"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Alasan Penolakan
                  </label>

                  <textarea
                    id="rejection_reason"
                    name="rejection_reason"
                    required
                    maxLength={1000}
                    rows={2}
                    placeholder="Tuliskan alasan penolakan Purchase Order..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  />

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
                  >
                    Reject Purchase Order
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* Informasi Utama */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Informasi Purchase Order
            </h2>

            <div className="grid gap-x-10 md:grid-cols-2">
              <div>
                <DetailRow
                  label="Nomor PO"
                  value={order.po_number}
                />

                <DetailRow
                  label="Tanggal PO"
                  value={formatDate(order.order_date)}
                />

                <DetailRow
                  label="Tanggal Estimasi"
                  value={formatDate(order.expected_date)}
                />
              </div>

              <div>
                <DetailRow
                  label="Supplier"
                  value={
                    order.supplier
                      ? `${order.supplier.supplier_code} - ${order.supplier.supplier_name}`
                      : "-"
                  }
                />

                <DetailRow
                  label="Gudang Tujuan"
                  value={
                    order.warehouse
                      ? `${order.warehouse.warehouse_code} - ${order.warehouse.warehouse_name}`
                      : "-"
                  }
                />

                <DetailRow
                  label="Mata Uang"
                  value={currency}
                />
              </div>
            </div>
          </section>

          {/* Ringkasan Penerimaan */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Total Dipesan
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatQuantity(totalOrdered)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Total Diterima
              </p>

              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {formatQuantity(totalReceived)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Sisa Belum Diterima
              </p>

              <p className="mt-2 text-2xl font-bold text-amber-600">
                {formatQuantity(totalRemaining)}
              </p>
            </div>
          </section>

          {/* Daftar Item Purchase Order */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Item Purchase Order
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Daftar produk dan rincian pembelian.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3">SKU Varian</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Diterima</th>
                    <th className="px-4 py-3 text-right">Sisa</th>
                    <th className="px-4 py-3 text-right">Harga Satuan</th>
                    <th className="px-4 py-3 text-right">Diskon</th>
                    <th className="px-4 py-3 text-right">Pajak</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">
                          {item.variant?.product?.product_name || "-"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {item.variant?.variant_name || "-"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {item.variant?.product?.sku || "-"}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        {item.variant?.variant_sku || "-"}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {formatQuantity(item.quantity)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {formatQuantity(item.received_quantity)}
                      </td>

                      <td className="px-4 py-4 text-right font-medium tabular-nums text-amber-700">
                        {formatQuantity(
                          Math.max(
                            Number(item.quantity) -
                              Number(item.received_quantity),
                            0
                          )
                        )}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {formatCurrency(item.unit_cost, currency)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {formatCurrency(item.discount_amount, currency)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {formatCurrency(item.tax_amount, currency)}
                      </td>

                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(item.line_total, currency)}
                      </td>
                    </tr>
                  ))}

                  {order.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        Belum ada item Purchase Order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Riwayat Goods Receipt */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Riwayat Goods Receipt
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Daftar penerimaan barang berdasarkan Purchase Order ini.
              </p>
            </div>

            {receiptError ? (
              <div className="p-5 text-sm text-red-600">
                Riwayat Goods Receipt gagal dimuat.
              </div>
            ) : goodsReceipts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-medium text-slate-700">
                  Belum ada Goods Receipt.
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Penerimaan barang akan tercatat di sini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Nomor GR</th>
                      <th className="px-5 py-3">Tanggal</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Waktu Posting</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {goodsReceipts.map((receipt) => (
                      <tr
                        key={receipt.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 font-semibold text-blue-700">
                          {receipt.receipt_number}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {formatDate(receipt.receipt_date)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              receipt.status === "posted"
                                ? "bg-emerald-100 text-emerald-700"
                                : receipt.status === "cancelled"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {receipt.status === "posted"
                              ? "Posted"
                              : receipt.status === "cancelled"
                                ? "Cancelled"
                                : "Draft"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {formatDateTime(receipt.posted_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Ringkasan Total */}
          <section className="flex justify-end">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:max-w-md sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Ringkasan Pembayaran
              </h2>

              <DetailRow
                label="Subtotal"
                value={formatCurrency(order.subtotal, currency)}
              />

              <DetailRow
                label="Total Diskon"
                value={formatCurrency(order.discount_amount, currency)}
              />

              <DetailRow
                label="Total Pajak"
                value={formatCurrency(order.tax_amount, currency)}
              />

              <DetailRow
                label="Biaya Pengiriman"
                value={formatCurrency(order.shipping_cost, currency)}
              />

              <div className="mt-4 flex justify-between gap-4 border-t border-slate-200 pt-4">
                <span className="font-semibold text-slate-900">
                  Grand Total
                </span>

                <span className="text-lg font-bold text-blue-700">
                  {formatCurrency(order.grand_total, currency)}
                </span>
              </div>
            </div>
          </section>

          {/* Catatan */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Catatan Purchase Order
            </h2>

            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {order.notes || "Tidak ada catatan."}
            </p>
          </section>

          {/* Informasi Proses */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Informasi Proses
            </h2>

            <DetailRow
              label="Dibuat"
              value={formatDateTime(order.created_at)}
            />

            <DetailRow
              label="Disetujui"
              value={formatDateTime(order.approved_at)}
            />

            <DetailRow
              label="Ditolak"
              value={formatDateTime(order.rejected_at)}
            />

            {order.status === "rejected" && (
              <DetailRow
                label="Alasan Penolakan"
                value={
                  <span className="whitespace-pre-wrap text-red-700">
                    {order.rejection_reason || "-"}
                  </span>
                }
              />
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
