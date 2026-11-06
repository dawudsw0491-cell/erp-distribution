
"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createSupplierProductAction,
  deleteSupplierProductAction,
  getSupplierProductsAction,
  searchAvailableProductsAction,
  updateSupplierProductAction,
  type AvailableProduct,
} from "../product-actions";

type Props = {
  supplierId: string;
  currencyCode: string;
  canCreate: boolean;
  canUpdate: boolean;
};

type ProductInfo = {
  id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  product_type: string;
  tracking_type: string;
  unit: string;
  is_active: boolean;
};

type SupplierProduct = {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_product_code: string | null;
  purchase_price: number | string | null;
  minimum_order_quantity: number;
  lead_time_days: number;
  is_preferred: boolean;
  is_active: boolean;
  notes: string | null;
  products: ProductInfo | null;
};

type FormState = {
  supplierProductCode: string;
  purchasePrice: string;
  minimumOrderQuantity: string;
  leadTimeDays: string;
  isPreferred: boolean;
  isActive: boolean;
  notes: string;
};

const INITIAL_FORM: FormState = {
  supplierProductCode: "",
  purchasePrice: "",
  minimumOrderQuantity: "1",
  leadTimeDays: "0",
  isPreferred: false,
  isActive: true,
  notes: "",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 caret-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";

function formatCurrency(value: number | null, currency: string) {
  if (value === null) return "-";

  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

export default function ProductSupplierManager({
  supplierId,
  currencyCode,
  canCreate,
  canUpdate,
}: Props) {
  const [relations, setRelations] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierProduct | null>(null);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<AvailableProduct[]>([]);
  const [selectedProduct, setSelectedProduct] =
    useState<AvailableProduct | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const loadRelations = useCallback(async () => {
    setLoading(true);

    try {
      const result = await getSupplierProductsAction(supplierId);

      if (!result.success) {
        setErrorMessage(result.message);
        setRelations([]);
      } else {
        setErrorMessage("");
        setRelations((result.data ?? []) as SupplierProduct[]);
      }
    } catch {
      setErrorMessage("Gagal memuat daftar produk supplier.");
      setRelations([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void loadRelations();
  }, [loadRelations]);

  useEffect(() => {
    if (!modalOpen || editing || searchKeyword.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");

      try {
        const result = await searchAvailableProductsAction(searchKeyword);

        if (cancelled) return;

        if (!result.success) {
          setSearchResults([]);
          setSearchError(result.message);
        } else {
          setSearchResults(
            (result.data ?? []) as AvailableProduct[]
          );
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError("Gagal mencari produk. Silakan coba kembali.");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modalOpen, editing, searchKeyword]);

  function openCreateForm() {
    setEditing(null);
    setSelectedProduct(null);
    setSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setForm(INITIAL_FORM);
    setMessage("");
    setErrorMessage("");
    setModalOpen(true);
  }

  function openEditForm(item: SupplierProduct) {
    setEditing(item);
    setSelectedProduct(null);
    setSearchKeyword("");
    setSearchResults([]);
    setSearchError("");

    setForm({
      supplierProductCode: item.supplier_product_code ?? "",
      purchasePrice:
        item.purchase_price === null
          ? ""
          : String(item.purchase_price),
      minimumOrderQuantity: String(item.minimum_order_quantity),
      leadTimeDays: String(item.lead_time_days),
      isPreferred: item.is_preferred,
      isActive: item.is_active,
      notes: item.notes ?? "",
    });

    setMessage("");
    setErrorMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setSelectedProduct(null);
    setSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setForm(INITIAL_FORM);
  }

  function updateForm<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function selectProduct(product: AvailableProduct) {
    const alreadyLinked = relations.some(
      (item) => item.product_id === product.id
    );

    if (alreadyLinked) {
      setErrorMessage("Produk ini sudah terhubung dengan supplier.");
      return;
    }

    setSelectedProduct(product);
    setSearchKeyword("");
    setSearchResults([]);
    setSearchError("");
    setErrorMessage("");
  }

  async function handleSave() {
    setMessage("");
    setErrorMessage("");

    if (!editing && !selectedProduct) {
      setErrorMessage("Pilih produk terlebih dahulu.");
      return;
    }

    if (form.isPreferred && !canUpdate) {
      setErrorMessage(
        "Anda tidak memiliki izin mengatur Preferred Supplier."
      );
      return;
    }

    const minimumOrderQuantity = Number(
      form.minimumOrderQuantity
    );

    const leadTimeDays = Number(form.leadTimeDays);

    const purchasePrice =
      form.purchasePrice.trim() === ""
        ? null
        : Number(form.purchasePrice);

    if (
      !Number.isFinite(minimumOrderQuantity) ||
      minimumOrderQuantity <= 0
    ) {
      setErrorMessage("MOQ harus lebih besar dari 0.");
      return;
    }

    if (
      !Number.isInteger(leadTimeDays) ||
      leadTimeDays < 0
    ) {
      setErrorMessage(
        "Lead time harus berupa bilangan bulat nonnegatif."
      );
      return;
    }

    if (
      purchasePrice !== null &&
      (!Number.isFinite(purchasePrice) || purchasePrice < 0)
    ) {
      setErrorMessage("Harga beli tidak boleh negatif.");
      return;
    }

    if (form.isPreferred && !form.isActive) {
      setErrorMessage(
        "Relasi nonaktif tidak dapat menjadi Preferred Supplier."
      );
      return;
    }

    setSaving(true);

    try {
      const result = editing
        ? await updateSupplierProductAction({
            relationId: editing.id,
            supplierId,
            supplierProductCode: form.supplierProductCode,
            purchasePrice,
            minimumOrderQuantity,
            leadTimeDays,
            isPreferred: form.isPreferred,
            isActive: form.isActive,
            notes: form.notes,
          })
        : await createSupplierProductAction({
            supplierId,
            productId: selectedProduct!.id,
            supplierProductCode: form.supplierProductCode,
            purchasePrice,
            minimumOrderQuantity,
            leadTimeDays,
            isPreferred: form.isPreferred,
            isActive: form.isActive,
            notes: form.notes,
          });

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      setMessage(result.message);
      setModalOpen(false);
      setEditing(null);
      setSelectedProduct(null);
      setSearchKeyword("");
      setSearchResults([]);
      setSearchError("");
      setForm(INITIAL_FORM);

      await loadRelations();
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan relasi produk.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: SupplierProduct) {
    const confirmed = window.confirm(
      `Hapus relasi produk ${item.products?.sku ?? ""} dengan supplier ini?`
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const result = await deleteSupplierProductAction({
        relationId: item.id,
        supplierId,
      });

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      setMessage(result.message);
      await loadRelations();
    } catch {
      setErrorMessage("Terjadi kesalahan saat menghapus relasi produk.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </div>
      )}

      {errorMessage && !modalOpen && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            Daftar produk yang dapat dipasok oleh supplier ini.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <span className="text-lg leading-none">+</span>
            Hubungkan Produk
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Memuat daftar produk supplier...
        </div>
      ) : errorMessage && !relations.length ? (
        <p className="text-sm text-red-600">{errorMessage}</p>
      ) : relations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          Belum ada relasi produk dengan supplier ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">Nama Produk</th>
                <th className="p-3">Harga Beli</th>
                <th className="p-3">MOQ</th>
                <th className="p-3">Lead Time</th>
                <th className="p-3">Status</th>
                {canUpdate && (
                  <th className="p-3 text-right">Tindakan</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {relations.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">
                    {item.products?.sku ?? "-"}
                  </td>

                  <td className="p-3">
                    <div className="font-medium text-slate-900">
                      {item.products?.product_name ?? "-"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.supplier_product_code ||
                        "Tanpa kode supplier"}
                    </div>
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {formatCurrency(
                      item.purchase_price === null
                        ? null
                        : Number(item.purchase_price),
                      currencyCode
                    )}
                  </td>

                  <td className="p-3">
                    {item.minimum_order_quantity}
                  </td>

                  <td className="p-3">
                    {item.lead_time_days} hari
                  </td>

                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.is_active ? "Aktif" : "Nonaktif"}
                      </span>

                      {item.is_preferred && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Preferred
                        </span>
                      )}
                    </div>
                  </td>

                  {canUpdate && (
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          disabled={saving}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={saving}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-supplier-title"
            className="my-auto w-full max-w-xl rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3
                id="product-supplier-title"
                className="font-semibold text-slate-900"
              >
                {editing
                  ? "Edit Relasi Produk"
                  : "Hubungkan Produk dengan Supplier"}
              </h3>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup"
                className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
              {!editing && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Cari Produk
                  </label>

                  {selectedProduct ? (
                    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {selectedProduct.product_name}
                        </p>
                        <p className="text-xs text-slate-600">
                          {selectedProduct.sku}
                          {selectedProduct.barcode
                            ? ` • ${selectedProduct.barcode}`
                            : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedProduct(null)}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(event) =>
                          setSearchKeyword(event.target.value)
                        }
                        placeholder="Masukkan SKU, nama produk, atau barcode..."
                        className={INPUT_CLASS}
                      />

                      {searching && (
                        <p className="mt-2 text-xs text-slate-500">
                          Mencari produk...
                        </p>
                      )}

                      {searchError && (
                        <p
                          role="alert"
                          className="mt-2 text-xs text-red-600"
                        >
                          {searchError}
                        </p>
                      )}

                      {!searching &&
                        !searchError &&
                        searchKeyword.trim().length >= 2 &&
                        searchResults.length === 0 && (
                          <p className="mt-2 text-xs text-slate-500">
                            Tidak ada produk aktif yang ditemukan.
                          </p>
                        )}

                      {searchResults.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                          {searchResults.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => selectProduct(product)}
                              className="block w-full border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-blue-50"
                            >
                              <span className="block text-sm font-medium text-slate-900">
                                {product.product_name}
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {product.sku}
                                {product.barcode
                                  ? ` • ${product.barcode}`
                                  : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {editing && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Produk</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {editing.products?.product_name ?? "-"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {editing.products?.sku ?? "-"}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Kode Produk Supplier
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.supplierProductCode}
                  onChange={(event) =>
                    updateForm("supplierProductCode", event.target.value)
                  }
                  className={INPUT_CLASS}
                  placeholder="Opsional"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Harga Beli ({currencyCode})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.purchasePrice}
                  onChange={(event) =>
                    updateForm("purchasePrice", event.target.value)
                  }
                  className={INPUT_CLASS}
                  placeholder="Kosongkan jika belum ditentukan"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Minimum Order Quantity
                  </label>
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.minimumOrderQuantity}
                    onChange={(event) =>
                      updateForm(
                        "minimumOrderQuantity",
                        event.target.value
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Lead Time (hari)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.leadTimeDays}
                    onChange={(event) =>
                      updateForm("leadTimeDays", event.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Catatan
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.notes}
                  onChange={(event) =>
                    updateForm("notes", event.target.value)
                  }
                  className={INPUT_CLASS}
                  placeholder="Catatan tambahan..."
                />
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => {
                      const active = event.target.checked;

                      updateForm("isActive", active);

                      if (!active) {
                        updateForm("isPreferred", false);
                      }
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      Relasi Aktif
                    </span>
                    <span className="text-xs text-slate-500">
                      Relasi nonaktif tidak dapat menjadi Preferred Supplier.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.isPreferred}
                    disabled={!form.isActive || !canUpdate}
                    onChange={(event) =>
                      updateForm("isPreferred", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-40"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      Preferred Supplier
                    </span>
                    <span className="text-xs text-slate-500">
                      Menetapkan supplier ini sebagai supplier utama produk.
                      Preferred sebelumnya akan dialihkan secara otomatis.
                      {!canUpdate &&
                        " Anda tidak memiliki izin untuk mengubah pengaturan ini."}
                    </span>
                  </span>
                </label>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (!editing && !selectedProduct)}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Menyimpan..."
                  : editing
                    ? "Simpan Perubahan"
                    : "Hubungkan Produk"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
