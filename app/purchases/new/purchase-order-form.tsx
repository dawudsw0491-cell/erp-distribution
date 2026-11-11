"use client";

import { useEffect, useMemo, useState } from "react";

import { createPurchaseOrderAction } from "../actions";

type Supplier = {
  id: string;
  supplier_code: string;
  supplier_name: string;
  currency_code: string;
  payment_term_days: number;
};

type Warehouse = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type Variant = {
  id: string;
  variant_sku: string;
  variant_name: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_type: string;
  tracking_type: string;
};

type PurchaseItem = {
  product_variant_id: string;
  quantity: string;
  unit_cost: string;
  discount_amount: string;
  tax_amount: string;
  notes: string;
};

type Props = {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  variants: Variant[];
};

function createEmptyItem(variantId: string): PurchaseItem {
  return {
    product_variant_id: variantId,
    quantity: "1",
    unit_cost: "0",
    discount_amount: "0",
    tax_amount: "0",
    notes: "",
  };
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: currency || "IDR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("id-ID")}`;
  }
}

export default function PurchaseOrderForm({
  suppliers,
  warehouses,
  variants,
}: Props) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
    const [orderDate, setOrderDate] = useState("");

  useEffect(() => {
    const today = new Date();

    const localDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    setOrderDate(localDate);
  }, []);
  const [items, setItems] = useState<PurchaseItem[]>([
    createEmptyItem(variants[0]?.id ?? ""),
  ]);

  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId
  );

  const currency = selectedSupplier?.currency_code || "IDR";

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unit_cost || 0);
    }, 0);

    const discount = items.reduce(
      (sum, item) => sum + Number(item.discount_amount || 0),
      0
    );

    const tax = items.reduce(
      (sum, item) => sum + Number(item.tax_amount || 0),
      0
    );

    return {
      subtotal,
      discount,
      tax,
      total: subtotal - discount + tax,
    };
  }, [items]);

  function updateItem(
    index: number,
    field: keyof PurchaseItem,
    value: string
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item
      )
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      createEmptyItem(variants[0]?.id ?? ""),
    ]);
  }

  function removeItem(index: number) {
    setItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <form action={createPurchaseOrderAction} className="space-y-6">

      {/* Informasi PO */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Informasi Purchase Order
        </h2>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">

          <div>
            <label
              htmlFor="supplier_id"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Supplier <span className="text-red-600">*</span>
            </label>

            <select
              id="supplier_id"
              name="supplier_id"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_code} - {supplier.supplier_name}
                </option>
              ))}
            </select>

            {selectedSupplier && (
              <p className="mt-1 text-xs text-slate-500">
                Termin pembayaran: {selectedSupplier.payment_term_days} hari
                {" · "}
                Mata uang: {currency}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="warehouse_id"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Warehouse Tujuan <span className="text-red-600">*</span>
            </label>

            <select
              id="warehouse_id"
              name="warehouse_id"
              required
              defaultValue={warehouses[0]?.id ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.warehouse_code} - {warehouse.warehouse_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="order_date"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Tanggal PO <span className="text-red-600">*</span>
            </label>

                     <input
              id="order_date"
              name="order_date"
              type="date"
              required
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="expected_date"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Estimasi Kedatangan
            </label>

            <input
              id="expected_date"
              name="expected_date"
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="notes"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Catatan
            </label>

            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              placeholder="Catatan tambahan untuk Purchase Order..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>

        </div>
      </section>

      {/* Daftar item */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Item Purchase Order
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tambahkan produk dan varian yang akan dibeli.
            </p>
          </div>

          <button
            type="button"
            onClick={addItem}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            + Tambah Item
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {items.map((item, index) => {
            const selectedVariant = variants.find(
              (variant) => variant.id === item.product_variant_id
            );

            const gross =
              Number(item.quantity || 0) * Number(item.unit_cost || 0);

            const lineTotal =
              gross -
              Number(item.discount_amount || 0) +
              Number(item.tax_amount || 0);

            return (
              <div
                key={index}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">
                    Item {index + 1}
                  </h3>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Produk / Varian
                    </label>

                    <select
                      value={item.product_variant_id}
                      onChange={(event) =>
                        updateItem(
                          index,
                          "product_variant_id",
                          event.target.value
                        )
                      }
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.product_sku} - {variant.product_name}
                          {" | "}
                          {variant.variant_sku} - {variant.variant_name}
                        </option>
                      ))}
                    </select>

                    {selectedVariant && (
                      <p className="mt-1 text-xs text-slate-500">
                        Tracking: {selectedVariant.tracking_type}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Kuantitas
                    </label>

                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, "quantity", event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Harga Beli per Unit ({currency})
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={item.unit_cost}
                      onChange={(event) =>
                        updateItem(index, "unit_cost", event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Diskon Total ({currency})
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount_amount}
                      onChange={(event) =>
                        updateItem(
                          index,
                          "discount_amount",
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Pajak Total ({currency})
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.tax_amount}
                      onChange={(event) =>
                        updateItem(index, "tax_amount", event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Catatan Item
                    </label>

                    <input
                      type="text"
                      maxLength={500}
                      value={item.notes}
                      onChange={(event) =>
                        updateItem(index, "notes", event.target.value)
                      }
                      placeholder="Catatan opsional..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </div>

                </div>

                <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm">
                  <span className="text-slate-500">
                    Total item
                  </span>
                  <strong className="text-slate-900">
                    {formatCurrency(lineTotal, currency)}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>

        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items)}
        />
      </section>

      {/* Ringkasan total */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Ringkasan Pembelian
        </h2>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span>{formatCurrency(totals.subtotal, currency)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-600">Total Diskon</span>
            <span className="text-red-600">
              -{formatCurrency(totals.discount, currency)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-600">Total Pajak</span>
            <span>{formatCurrency(totals.tax, currency)}</span>
          </div>

          <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold">
            <span>Grand Total</span>
            <span className="text-blue-700">
              {formatCurrency(totals.total, currency)}
            </span>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="shipping_cost"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Biaya Pengiriman ({currency})
          </label>

          <input
            id="shipping_cost"
            name="shipping_cost"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm md:max-w-sm"
          />

          <p className="mt-2 text-xs text-slate-500">
            Biaya pengiriman akan ditambahkan ke Grand Total saat disimpan.
          </p>
        </div>
      </section>

      {/* Tombol aksi */}
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <a
          href="/purchases"
          className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </a>

        <button
          type="submit"
          disabled={
            items.length === 0 ||
            items.some(
              (item) =>
                !item.product_variant_id ||
                Number(item.quantity) <= 0 ||
                Number(item.unit_cost) < 0 ||
                Number(item.discount_amount) < 0 ||
                Number(item.tax_amount) < 0
            )
          }
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Simpan sebagai Draft
        </button>
      </div>

    </form>
  );
}
