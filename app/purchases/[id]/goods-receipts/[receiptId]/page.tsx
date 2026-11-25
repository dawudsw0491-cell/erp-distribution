
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { confirmGoodsReceiptAction, recoverPostedGoodsReceiptImeiAction } from "../../../actions";

export const instant = false;

type PageProps = {
  params: Promise<{
    id: string;
    receiptId: string;
  }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    receipt_posted?: string;
    imei_recovered?: string;
  }>;
};

type ReceiptDetail = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  posted_at: string | null;
  purchase_order_id: string;
  supplier_id: string;
  warehouse_id: string;
  purchase_order: {
    po_number: string;
  } | null;
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
    quantity_received: number;
    unit_cost: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    inventory_status: string;
    notes: string | null;
    purchase_order_item: {
      product: {
        sku: string;
        product_name: string;
      } | null;
      product_variant: {
        product: { tracking_type: string } | null;
      } | null;
    } | null;
    units: {
      id: string;
      unit_code: string;
      identifiers: {
        identifier_type: string;
        identifier_value: string;
      }[];
    }[];
  }[];
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("id-ID") : "-";
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  posted: "Diterima",
  cancelled: "Cancelled",
};

export default async function GoodsReceiptDetailPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id, receiptId } = await params;
  const query = await searchParams;

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.view");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  const { data, error } = await supabase
    .from("goods_receipts")
    .select(`
      id,
      receipt_number,
      receipt_date,
      status,
      notes,
      created_at,
      posted_at,
      purchase_order_id,
      supplier_id,
      warehouse_id,
      purchase_order:purchase_orders (
        po_number
      ),
      supplier:suppliers (
        supplier_code,
        supplier_name
      ),
      warehouse:warehouses (
        warehouse_code,
        warehouse_name
      ),
      items:goods_receipt_items (
        id,
        quantity_received,
        unit_cost,
        discount_amount,
        tax_amount,
        line_total,
        inventory_status,
        notes,
        purchase_order_item:purchase_order_items!goods_receipt_items_purchase_order_item_id_fkey (
          product:products!fk_purchase_order_items_product_id (
            sku,
            product_name
          ),
          product_variant:product_variants!purchase_order_items_product_variant_id_fkey (
            product:products ( tracking_type )
          )
        ),
        units:goods_receipt_units (
          id,
          unit_code,
          identifiers:goods_receipt_unit_identifiers (
            identifier_type,
            identifier_value
          )
        )
      )
    `)
    .eq("id", receiptId)
    .eq("purchase_order_id", id)
    .maybeSingle();

  if (error) {
    console.error("Goods Receipt detail query failed:", error);
    redirect(`/purchases/${id}?error=load_failed`);
  }

  if (!data) notFound();

  const receipt = data as unknown as ReceiptDetail;

  const totalQuantity = receipt.items.reduce(
    (sum, item) => sum + Number(item.quantity_received || 0),
    0
  );

  const totalValue = receipt.items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity_received || 0) *
        Number(item.unit_cost || 0) -
      Number(item.discount_amount || 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:overflow-hidden">
      <ErpSidebar activePath="/purchases" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <a
                href={`/purchases/${id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                ← Kembali ke Purchase Order
              </a>

              <h1 className="mt-3 text-2xl font-bold text-slate-900">
                Detail Goods Receipt
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Nomor GR: {receipt.receipt_number}
              </p>
            </div>

            <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
              receipt.status === "posted"
                ? "bg-emerald-100 text-emerald-700"
                : receipt.status === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
            }`}>
              {statusLabels[receipt.status] || receipt.status}
            </span>
          </div>

          {query.created === "1" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Goods Receipt berhasil dibuat sebagai draft.
            </div>
          )}

          {query.receipt_posted === "1" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Penerimaan barang berhasil dikonfirmasi dan saldo persediaan telah diperbarui.
            </div>
          )}

          {query.imei_recovered === "1" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Identitas IMEI berhasil dipulihkan dan ditautkan ke pergerakan stok yang sudah ada. Kuantitas persediaan tidak ditambah.
            </div>
          )}

          {query.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {query.error === "post_failed"
                ? "Proses penerimaan barang gagal. Periksa data penerimaan dan hak akses."
                : query.error === "imei_recovery_failed"
                  ? "Pemulihan IMEI gagal. Pastikan IMEI benar, belum digunakan unit lain, dan item memenuhi syarat pemulihan."
                  : query.error === "invalid_imei"
                    ? "IMEI harus terdiri dari 15 digit."
                    : "Terjadi kesalahan saat memuat atau memproses Goods Receipt."}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Informasi Penerimaan
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">Nomor Goods Receipt</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {receipt.receipt_number}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Purchase Order</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {receipt.purchase_order?.po_number || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Tanggal Penerimaan</p>
                <p className="mt-1 font-medium text-slate-800">
                  {formatDate(receipt.receipt_date)}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Supplier</p>
                <p className="mt-1 font-medium text-slate-800">
                  {receipt.supplier
                    ? `${receipt.supplier.supplier_code} - ${receipt.supplier.supplier_name}`
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Gudang</p>
                <p className="mt-1 font-medium text-slate-800">
                  {receipt.warehouse
                    ? `${receipt.warehouse.warehouse_code} - ${receipt.warehouse.warehouse_name}`
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Waktu Penerimaan</p>
                <p className="mt-1 font-medium text-slate-800">
                  {formatDateTime(receipt.posted_at)}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Quantity Diterima</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatQuantity(totalQuantity)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Nilai Barang Setelah Diskon
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {formatCurrency(totalValue)}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                Item Goods Receipt
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Produk</th>
                    <th className="px-5 py-3 text-right">Quantity</th>
                    <th className="px-5 py-3 text-right">Harga Satuan</th>
                    <th className="px-5 py-3 text-right">Diskon</th>
                    <th className="px-5 py-3 text-right">Pajak</th>
                    <th className="px-5 py-3">Status Inventory</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {receipt.items.map((item) => {
                    const product =
                      item.purchase_order_item?.product;

                    return (
                      <tr key={item.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">
                            {product?.product_name || "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {product?.sku || "-"}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right tabular-nums">
                          {formatQuantity(item.quantity_received)}
                        </td>

                        <td className="px-5 py-4 text-right tabular-nums">
                          {formatCurrency(item.unit_cost)}
                        </td>

                        <td className="px-5 py-4 text-right tabular-nums">
                          {formatCurrency(item.discount_amount)}
                        </td>

                        <td className="px-5 py-4 text-right tabular-nums">
                          {formatCurrency(item.tax_amount)}
                        </td>

                        <td className="px-5 py-4">
                          {item.inventory_status}
                        </td>
                      </tr>
                    );
                  })}

                  {receipt.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        Belum ada item penerimaan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {receipt.items.some((item) => item.units.length > 0) && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  Identitas Unit IMEI / Serial
                </h2>
              </div>

              <div className="space-y-4 p-5">
                {receipt.items.flatMap((item) =>
                  item.units.map((unit) => (
                    <div
                      key={unit.id}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <p className="font-semibold text-slate-900">
                        {unit.unit_code}
                      </p>

                      <div className="mt-2 space-y-1">
                        {unit.identifiers.map((identifier, index) => (
                          <p key={`${unit.id}-${index}`} className="text-sm text-slate-600">
                            {identifier.identifier_type}: {identifier.identifier_value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {receipt.status === "posted" && receipt.items.some((item) =>
            item.purchase_order_item?.product_variant?.product?.tracking_type === "imei" &&
            Number(item.quantity_received) > item.units.length
          ) && (
            <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Pemulihan Identitas IMEI</h2>
              <p className="mt-1 text-sm text-slate-600">
                Gunakan hanya IMEI asli dari unit fisik yang diterima. Pemulihan ini melengkapi identitas unit pada Goods Receipt yang sudah diposting dan menautkannya ke movement stok yang ada, tanpa menambah kuantitas persediaan.
              </p>
              <div className="mt-4 space-y-3">
                {receipt.items.filter((item) =>
                  item.purchase_order_item?.product_variant?.product?.tracking_type === "imei" &&
                  Number(item.quantity_received) > item.units.length
                ).map((item) => (
                  <form key={item.id} action={recoverPostedGoodsReceiptImeiAction}
                    className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[1fr_260px_auto] sm:items-end">
                    <input type="hidden" name="goods_receipt_item_id" value={item.id} />
                    <input type="hidden" name="goods_receipt_id" value={receipt.id} />
                    <input type="hidden" name="purchase_order_id" value={receipt.purchase_order_id} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.purchase_order_item?.product?.product_name || "Produk IMEI"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Unit terdaftar: {item.units.length} / {formatQuantity(item.quantity_received)}
                      </p>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">IMEI asli (15 digit)</span>
                      <input name="imei_1" type="text" inputMode="numeric" autoComplete="off"
                        maxLength={15} pattern="[0-9]{15}" required
                        placeholder="Masukkan IMEI perangkat"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </label>
                    <button type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                      Pulihkan IMEI
                    </button>
                  </form>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-900">
              Catatan Penerimaan
            </h2>
            <p className="whitespace-pre-wrap text-sm text-slate-600">
              {receipt.notes || "Tidak ada catatan."}
            </p>
          </section>

          {receipt.status === "draft" && (
            <section className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Konfirmasi Penerimaan
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Konfirmasi akan memperbarui saldo dan nilai persediaan.
                </p>
              </div>

              <form action={confirmGoodsReceiptAction}>
                <input
                  type="hidden"
                  name="goods_receipt_id"
                  value={receipt.id}
                />
                <input
                  type="hidden"
                  name="purchase_order_id"
                  value={receipt.purchase_order_id}
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
                >
                  Konfirmasi Penerimaan
                </button>
              </form>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
