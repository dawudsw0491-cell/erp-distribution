"use client";

import { useMemo, useState } from "react";
import { createDeliveryOrderAction } from "../actions";

type Line = {
  id: string;
  product_variant_id: string;
  product_name: string;
  variant_sku: string;
  variant_name: string;
  tracking_type: string;
  outstanding: number;
};
type Unit = { id: string; product_variant_id: string; unit_code: string };
type DraftLine = {
  key: number;
  sales_order_item_id: string;
  quantity: string;
  product_unit_id: string;
};

export default function DeliveryOrderComposer({
  salesOrderId,
  lines,
  units,
}: {
  salesOrderId: string;
  lines: Line[];
  units: Unit[];
}) {
  const [rows, setRows] = useState<DraftLine[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const payload = useMemo(
    () =>
      rows.map(({ sales_order_item_id, quantity, product_unit_id }) => ({
        sales_order_item_id,
        quantity,
        ...(product_unit_id ? { product_unit_id } : {}),
      })),
    [rows]
  );

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(
        row.sales_order_item_id,
        (map.get(row.sales_order_item_id) ?? 0) + Number(row.quantity || 0)
      );
    }
    return map;
  }, [rows]);

  const duplicateUnits = new Set(
    rows.filter((row) => row.product_unit_id).map((row) => row.product_unit_id)
  );
  const invalid =
    rows.length === 0 ||
    rows.some((row) => {
      const line = lines.find((item) => item.id === row.sales_order_item_id);
      if (!line) return true;
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return true;
      if ((totals.get(line.id) ?? 0) > line.outstanding) return true;
      if (line.tracking_type === "serial") {
        return quantity !== 1 || !row.product_unit_id;
      }
      if (line.tracking_type === "imei" && quantity !== Math.trunc(quantity)) {
        return true;
      }
      return Boolean(row.product_unit_id) && quantity !== 1;
    }) ||
    duplicateUnits.size !== rows.filter((row) => row.product_unit_id).length;

  function addRow() {
    const first = lines[0];
    if (!first) return;
    setRows((current) => [
      ...current,
      {
        key: nextKey,
        sales_order_item_id: first.id,
        quantity: first.tracking_type === "serial" ? "1" : String(first.outstanding),
        product_unit_id: "",
      },
    ]);
    setNextKey((value) => value + 1);
  }

  function updateRow(key: number, patch: Partial<DraftLine>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Buat Delivery Order</h2>
          <p className="mt-1 text-xs text-slate-500">
            Satu unit serial per baris. Baris produk yang sama dapat ditambahkan lebih dari sekali.
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={lines.length === 0}
          className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-40"
        >
          + Tambah Item
        </button>
      </div>

      <form action={createDeliveryOrderAction} className="mt-4 space-y-4">
        <input type="hidden" name="sales_order_id" value={salesOrderId} />
        <input type="hidden" name="items" value={JSON.stringify(payload)} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold">
            Tanggal Pengiriman
            <input
              type="date"
              name="delivery_date"
              required
              defaultValue={new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Jakarta",
              })}
              className="mt-1 w-full rounded border p-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold">
            Catatan
            <input
              name="notes"
              maxLength={2000}
              className="mt-1 w-full rounded border p-2 text-sm"
            />
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
            Tambahkan item yang akan dikirim.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => {
              const selected = lines.find(
                (line) => line.id === row.sales_order_item_id
              );
              const selectedUnitIds = new Set(
                rows
                  .filter(
                    (candidate) =>
                      candidate.key !== row.key && candidate.product_unit_id
                  )
                  .map((candidate) => candidate.product_unit_id)
              );
              const remaining =
                (selected?.outstanding ?? 0) -
                (totals.get(row.sales_order_item_id) ?? 0) +
                Number(row.quantity || 0);

              return (
                <div
                  key={row.key}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
                >
                  <label className="text-xs font-semibold">
                    Produk
                    <select
                      value={row.sales_order_item_id}
                      onChange={(event) => {
                        const line = lines.find(
                          (item) => item.id === event.target.value
                        );
                        updateRow(row.key, {
                          sales_order_item_id: event.target.value,
                          quantity:
                            line?.tracking_type === "serial"
                              ? "1"
                              : String(line?.outstanding ?? 1),
                          product_unit_id: "",
                        });
                      }}
                      className="mt-1 w-full rounded border p-2 text-sm"
                    >
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.variant_sku} — {line.product_name} {line.variant_name}
                          {" · sisa "}
                          {line.outstanding}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold">
                    Kuantitas (sisa {remaining})
                    <input
                      aria-label={`Kuantitas item ${index + 1}`}
                      type="number"
                      min={selected?.tracking_type === "imei" || selected?.tracking_type === "serial" ? 1 : 0.001}
                      max={selected?.tracking_type === "serial" ? 1 : remaining}
                      step={selected?.tracking_type === "imei" || selected?.tracking_type === "serial" ? 1 : 0.001}
                      value={row.quantity}
                      onChange={(event) =>
                        updateRow(row.key, { quantity: event.target.value })
                      }
                      className="mt-1 w-full rounded border p-2 text-sm"
                    />
                  </label>

                  {selected?.tracking_type === "serial" ||
                  selected?.tracking_type === "imei" ? (
                    <label className="text-xs font-semibold">
                      Product Unit {selected.tracking_type === "serial" ? "(wajib)" : "(opsional)"}
                      <select
                        value={row.product_unit_id}
                        onChange={(event) =>
                          updateRow(row.key, { product_unit_id: event.target.value })
                        }
                        className="mt-1 w-full rounded border p-2 text-sm"
                      >
                        <option value="">Tidak dipilih</option>
                        {units
                          .filter(
                            (unit) =>
                              unit.product_variant_id === selected.product_variant_id &&
                              !selectedUnitIds.has(unit.id)
                          )
                          .map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.unit_code}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    <span className="self-center text-xs text-slate-400">
                      Produk quantity
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="self-end px-2 py-2 text-sm text-red-600"
                  >
                    Hapus
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            disabled={invalid}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Simpan Draft DO
          </button>
        </div>
      </form>
    </section>
  );
}
