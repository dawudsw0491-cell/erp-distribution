
"use client";

import { useMemo, useState } from "react";
import { createGoodsReceiptAction } from "../../actions";

type TrackingType = "quantity" | "imei" | "serial";

type InventoryStatus =
  | "available"
  | "reserved"
  | "quarantine"
  | "damaged"
  | "repair";

type ReceiptIdentifier = {
  identifier_type: "IMEI_1" | "IMEI_2" | "SERIAL_NUMBER";
  identifier_value: string;
};

type ReceiptUnit = {
  unit_code: string;
  imei1: string;
  imei2: string;
  serialNumber: string;
};

export type GoodsReceiptFormItem = {
  id: string;
  product_variant_id: string;
  product_name: string;
  product_sku: string;
  variant_name: string;
  variant_sku: string;
  tracking_type: TrackingType;
  ordered_quantity: number;
  received_quantity: number;
  draft_quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  discount_amount: number;
  tax_amount: number;
};

type ItemState = {
  quantity: string;
  inventoryStatus: InventoryStatus;
  notes: string;
  units: ReceiptUnit[];
};

type Props = {
  purchaseOrderId: string;
  receiptItems: GoodsReceiptFormItem[];
  receiptDate: string;
  errorMessage?: string;
};

const inventoryStatuses: {
  value: InventoryStatus;
  label: string;
}[] = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "quarantine", label: "Quarantine" },
  { value: "damaged", label: "Damaged" },
  { value: "repair", label: "Repair" },
];

function emptyUnit(): ReceiptUnit {
  return {
    unit_code: "",
    imei1: "",
    imei2: "",
    serialNumber: "",
  };
}

function createInitialState(
  items: GoodsReceiptFormItem[]
): ItemState[] {
  return items.map((item) => ({
    quantity:
      item.tracking_type === "quantity"
        ? String(item.remaining_quantity)
        : String(Math.floor(item.remaining_quantity)),
    inventoryStatus: "available",
    notes: "",
    units:
      item.tracking_type === "quantity"
        ? []
        : Array.from(
            {
              length: Math.min(
                Math.floor(item.remaining_quantity),
                100
              ),
            },
            () => emptyUnit()
          ),
  }));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 3,
  }).format(value || 0);
}

function isValidImei(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;

  let sum = 0;

  for (let index = 0; index < value.length; index++) {
    let digit = Number(value[index]);

    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

export default function GoodsReceiptForm({
  purchaseOrderId,
  receiptItems,
  receiptDate,
  errorMessage,
}: Props) {
  const [date, setDate] = useState(receiptDate);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemState[]>(() =>
    createInitialState(receiptItems)
  );
  const [clientError, setClientError] = useState("");

  const payload = useMemo(() => {
    return receiptItems.map((item, index) => {
      const state = items[index];

      const units =
        item.tracking_type === "quantity"
          ? []
          : state.units.map((unit) => {
              const identifiers: ReceiptIdentifier[] = [];

              if (item.tracking_type === "imei") {
                identifiers.push({
                  identifier_type: "IMEI_1",
                  identifier_value: unit.imei1.trim(),
                });

                if (unit.imei2.trim()) {
                  identifiers.push({
                    identifier_type: "IMEI_2",
                    identifier_value: unit.imei2.trim(),
                  });
                }
              }

              if (item.tracking_type === "serial") {
                identifiers.push({
                  identifier_type: "SERIAL_NUMBER",
                  identifier_value: unit.serialNumber.trim(),
                });
              }

              const unitCode =
                unit.unit_code.trim() ||
                (item.tracking_type === "imei"
                  ? unit.imei1.trim()
                  : unit.serialNumber.trim());

              return {
                unit_code: unitCode,
                identifiers,
              };
            });

      return {
        purchase_order_item_id: item.id,
        quantity_received: Number(state.quantity),
        unit_cost: item.unit_cost,
        discount_amount: item.discount_amount,
        tax_amount: item.tax_amount,
        inventory_status: state.inventoryStatus,
        notes: state.notes.trim(),
        units,
      };
    }).filter((item) => item.quantity_received > 0);
  }, [items, receiptItems]);

  function updateItem(
    index: number,
    changes: Partial<ItemState>
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, ...changes }
          : item
      )
    );
  }

  function updateQuantity(index: number, value: string) {
    const item = receiptItems[index];
    const current = items[index];

    if (!item || !current) return;

    const numericValue = Number(value);

    if (value !== "" && (!Number.isFinite(numericValue) || numericValue < 0)) {
      return;
    }

    if (numericValue > item.remaining_quantity) {
      setClientError(
        `Kuantitas penerimaan ${item.product_name} melebihi sisa PO.`
      );
      return;
    }

    if (item.tracking_type !== "quantity") {
      if (!/^\d*$/.test(value)) return;

      const count = value === "" ? 0 : Number(value);

      if (count > 100) {
        setClientError("Maksimal 100 unit per item dalam satu penerimaan.");
        return;
      }

      const units = [...current.units];

      while (units.length < count) {
        units.push(emptyUnit());
      }

      while (units.length > count) {
        units.pop();
      }

      updateItem(index, { quantity: value, units });
    } else {
      updateItem(index, { quantity: value });
    }

    setClientError("");
  }

  function updateUnit(
    itemIndex: number,
    unitIndex: number,
    changes: Partial<ReceiptUnit>
  ) {
    setItems((current) =>
      current.map((item, index) => {
        if (index !== itemIndex) return item;

        return {
          ...item,
          units: item.units.map((unit, index2) =>
            index2 === unitIndex
              ? { ...unit, ...changes }
              : unit
          ),
        };
      })
    );
  }

  function validate(): string | null {
    if (!date) return "Tanggal penerimaan wajib diisi.";

    if (notes.length > 2000) {
      return "Catatan maksimal 2.000 karakter.";
    }

    let selectedItems = 0;

    for (let index = 0; index < receiptItems.length; index++) {
      const product = receiptItems[index];
      const state = items[index];
      const quantity = Number(state.quantity);

      if (!Number.isFinite(quantity) || quantity < 0) {
        return `Kuantitas ${product.product_name} tidak valid.`;
      }

      if (quantity > product.remaining_quantity) {
        return `Kuantitas ${product.product_name} melebihi sisa PO.`;
      }

      if (product.tracking_type !== "quantity" && !Number.isInteger(quantity)) {
        return `Kuantitas produk serial ${product.product_name} harus bilangan bulat.`;
      }

      if (quantity === 0) continue;

      selectedItems++;

      if (product.tracking_type === "quantity") continue;

      if (state.units.length !== quantity) {
        return `Jumlah unit ${product.product_name} tidak sesuai kuantitas.`;
      }

      const seenIdentifiers = new Set<string>();

      for (let unitIndex = 0; unitIndex < state.units.length; unitIndex++) {
        const unit = state.units[unitIndex];

        if (product.tracking_type === "imei") {
          if (!isValidImei(unit.imei1.trim())) {
            return `IMEI 1 unit ${unitIndex + 1} pada ${product.product_name} harus 15 digit dan valid.`;
          }

          if (
            unit.imei2.trim() &&
            !isValidImei(unit.imei2.trim())
          ) {
            return `IMEI 2 unit ${unitIndex + 1} pada ${product.product_name} tidak valid.`;
          }

          if (
            unit.imei2.trim() &&
            unit.imei1.trim() === unit.imei2.trim()
          ) {
            return "IMEI 1 dan IMEI 2 tidak boleh sama.";
          }
        }

        if (
          product.tracking_type === "serial" &&
          !unit.serialNumber.trim()
        ) {
          return `Serial Number unit ${unitIndex + 1} pada ${product.product_name} wajib diisi.`;
        }

        const unitCode =
          unit.unit_code.trim() ||
          (product.tracking_type === "imei"
            ? unit.imei1.trim()
            : unit.serialNumber.trim());

        if (!unitCode || unitCode.length > 100) {
          return `Unit Code unit ${unitIndex + 1} pada ${product.product_name} wajib diisi dan maksimal 100 karakter.`;
        }

        const normalizedCode = unitCode.toUpperCase();

        if (seenIdentifiers.has(normalizedCode)) {
          return `Unit Code duplikat pada ${product.product_name}.`;
        }

        seenIdentifiers.add(normalizedCode);
      }
    }

    if (selectedItems === 0) {
      return "Masukkan kuantitas penerimaan minimal pada satu item.";
    }

    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validationError = validate();

    if (validationError) {
      event.preventDefault();
      setClientError(validationError);
      return;
    }

    setClientError("");
  }

  return (
    <form
      action={createGoodsReceiptAction}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <input
        type="hidden"
        name="purchase_order_id"
        value={purchaseOrderId}
      />

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(payload)}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">
          Receipt Information
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="receipt_date"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Receipt Date
            </label>

            <input
              id="receipt_date"
              name="receipt_date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="receipt_notes"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Notes
            </label>

            <input
              id="receipt_notes"
              name="notes"
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              placeholder="Catatan penerimaan barang"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {clientError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {clientError}
        </div>
      )}

      {receiptItems.map((product, index) => {
        const state = items[index];
        const quantity = Number(state.quantity) || 0;

        return (
          <section
            key={product.id}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {product.product_name}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {product.product_sku} · {product.variant_name} ·{" "}
                  {product.variant_sku}
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {product.tracking_type.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Ordered</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(product.ordered_quantity)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Received</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(product.received_quantity)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Draft Reserved</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(product.draft_quantity)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Remaining</p>
                <p className="mt-1 font-semibold text-blue-700">
                  {formatNumber(product.remaining_quantity)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor={`quantity-${product.id}`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Quantity Received
                </label>

                <input
                  id={`quantity-${product.id}`}
                  type="number"
                  min="0"
                  max={product.remaining_quantity}
                  step={
                    product.tracking_type === "quantity"
                      ? "0.001"
                      : "1"
                  }
                  value={state.quantity}
                  onChange={(event) =>
                    updateQuantity(index, event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor={`status-${product.id}`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Inventory Status
                </label>

                <select
                  id={`status-${product.id}`}
                  value={state.inventoryStatus}
                  onChange={(event) =>
                    updateItem(index, {
                      inventoryStatus: event.target.value as InventoryStatus,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {inventoryStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={`item-notes-${product.id}`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Item Notes
                </label>

                <input
                  id={`item-notes-${product.id}`}
                  type="text"
                  maxLength={500}
                  value={state.notes}
                  onChange={(event) =>
                    updateItem(index, { notes: event.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {product.tracking_type !== "quantity" && quantity > 0 && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-slate-900">
                    Unit Identifiers
                  </h4>

                  <span className="text-xs text-slate-500">
                    {state.units.length} unit
                  </span>
                </div>

                {state.units.map((unit, unitIndex) => (
                  <div
                    key={`${product.id}-${unitIndex}`}
                    className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      Unit {unitIndex + 1}
                    </p>

                    <div>
                      <label
                        htmlFor={`unit-code-${product.id}-${unitIndex}`}
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Unit Code (optional)
                      </label>

                      <input
                        id={`unit-code-${product.id}-${unitIndex}`}
                        value={unit.unit_code}
                        maxLength={100}
                        onChange={(event) =>
                          updateUnit(index, unitIndex, {
                            unit_code: event.target.value,
                          })
                        }
                        placeholder="Kosongkan untuk menggunakan identifier utama"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    {product.tracking_type === "imei" && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor={`imei1-${product.id}-${unitIndex}`}
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            IMEI 1 *
                          </label>

                          <input
                            id={`imei1-${product.id}-${unitIndex}`}
                            value={unit.imei1}
                            inputMode="numeric"
                            maxLength={15}
                            onChange={(event) =>
                              updateUnit(index, unitIndex, {
                                imei1: event.target.value.replace(/\D/g, ""),
                              })
                            }
                            placeholder="15 digit IMEI"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`imei2-${product.id}-${unitIndex}`}
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            IMEI 2 (opsional)
                          </label>

                          <input
                            id={`imei2-${product.id}-${unitIndex}`}
                            value={unit.imei2}
                            inputMode="numeric"
                            maxLength={15}
                            onChange={(event) =>
                              updateUnit(index, unitIndex, {
                                imei2: event.target.value.replace(/\D/g, ""),
                              })
                            }
                            placeholder="15 digit IMEI"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {product.tracking_type === "serial" && (
                      <div>
                        <label
                          htmlFor={`serial-${product.id}-${unitIndex}`}
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Serial Number *
                        </label>

                        <input
                          id={`serial-${product.id}-${unitIndex}`}
                          value={unit.serialNumber}
                          maxLength={255}
                          onChange={(event) =>
                            updateUnit(index, unitIndex, {
                              serialNumber: event.target.value,
                            })
                          }
                          placeholder="Masukkan serial number"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap justify-end gap-3">
        <a
          href={`/purchases/${purchaseOrderId}`}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Create Goods Receipt Draft
        </button>
      </div>
    </form>
  );
}
