
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteProductModel,
  getProductModelDeletionPreview,
} from "./actions";

type PreviewValue = {
  id: string;
  code: string;
  name: string;
  shared: boolean;
};

type PreviewAttribute = {
  id: string;
  code: string;
  name: string;
  shared: boolean;
  values: PreviewValue[];
};

type PreviewVariant = {
  id: string;
  productId: string;
  productName: string;
  name: string;
  attributes: string[];
};

type PreviewProduct = {
  id: string;
  name: string;
};

type PreviewBlocker = {
  name: string;
  count: number;
};

type DeletionPreview = {
  success: true;
  model: {
    id: string;
    code: string;
    name: string;
  };
  products: PreviewProduct[];
  attributes: PreviewAttribute[];
  variants: PreviewVariant[];
  counts: {
    products: number;
    attributes: number;
    values: number;
    variants: number;
  };
  blockers: PreviewBlocker[];
  canDelete: boolean;
};

type PreviewResult =
  | DeletionPreview
  | {
      success: false;
      error: string;
    };

type DeleteResult = {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
  hint?: string;
  code?: string;
  deletedProducts?: number;
  deletedVariants?: number;
};

type Props = {
  modelId: string;
  modelCode: string;
};

export default function DeleteProductModelButton({
  modelId,
  modelCode,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deleteMasterProducts, setDeleteMasterProducts] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleOpen() {
    if (loadingPreview || deleting) return;

    setOpen(true);
    setLoadingPreview(true);
    setPreview(null);
    setError("");
    setSuccessMessage("");
    setDeleteMasterProducts(false);
    setConfirmed(false);

    try {
      const result: PreviewResult =
        await getProductModelDeletionPreview(modelId);

      if (!result.success) {
        setError(result.error || "Gagal memuat rincian Product Model.");
        return;
      }

      setPreview(result);
    } catch (err) {
      console.error("Load Product Model deletion preview failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat rincian data Product Model."
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleClose() {
    if (deleting) return;

    setOpen(false);
    setError("");
    setSuccessMessage("");
  }

  async function handleDelete() {
    setError("");

    if (!preview) {
      setError("Rincian penghapusan belum tersedia. Muat ulang dialog.");
      return;
    }

    if (!confirmed) {
      setError("Centang persetujuan penghapusan terlebih dahulu.");
      return;
    }

    if (preview.counts.products > 0 && !deleteMasterProducts) {
      setError(
        "Persetujuan penghapusan Master Product wajib diberikan secara terpisah."
      );
      return;
    }

    if (!preview.canDelete || preview.blockers.length > 0) {
      setError(
        "Product Model belum dapat dihapus karena masih memiliki dependensi yang dilindungi."
      );
      return;
    }

    if (deleting) return;

    setDeleting(true);

    try {
      const result: DeleteResult = await deleteProductModel(
        modelId,
        deleteMasterProducts
      );

      if (!result || result.success !== true) {
        const errorParts = [
          result?.error || "Penghapusan Product Model gagal.",
          result?.details,
          result?.hint,
          result?.code ? `Kode: ${result.code}` : undefined,
        ].filter(Boolean);

        setError(errorParts.join(" "));
        return;
      }

      setSuccessMessage(
        result.message || `Product Model ${modelCode} berhasil dihapus.`
      );

      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Delete Product Model failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghapus Product Model."
      );
    } finally {
      setDeleting(false);
    }
  }

  const hasProducts = (preview?.counts.products ?? 0) > 0;
  const hasBlockers = (preview?.blockers.length ?? 0) > 0;

  const deleteDisabled =
    loadingPreview ||
    deleting ||
    !preview ||
    !preview.canDelete ||
    hasBlockers ||
    !confirmed ||
    (hasProducts && !deleteMasterProducts);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loadingPreview || deleting}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Hapus
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Konfirmasi Penghapusan Product Model
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Model Code: {modelCode}
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={deleting}
                aria-label="Tutup dialog"
                className="text-2xl leading-none text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {loadingPreview && (
                <div className="py-8 text-center text-sm text-gray-500">
                  Memuat rincian data yang terkait...
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  <p className="font-semibold">Penghapusan gagal</p>
                  <p className="mt-1 break-words">{error}</p>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
                >
                  {successMessage}
                </div>
              )}

              {preview && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <SummaryItem
                      label="Master Product"
                      value={preview.counts.products}
                    />
                    <SummaryItem
                      label="Product Attributes"
                      value={preview.counts.attributes}
                    />
                    <SummaryItem
                      label="Attribute Values"
                      value={preview.counts.values}
                    />
                    <SummaryItem
                      label="Product Variants"
                      value={preview.counts.variants}
                    />
                  </div>

                  <section>
                    <h3 className="mb-3 font-semibold text-gray-900">
                      Master Product
                    </h3>

                    {preview.products.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Tidak ada Master Product yang terhubung dengan model ini.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {preview.products.map((product) => (
                          <li
                            key={product.id}
                            className="rounded-lg border p-3 text-sm text-gray-800"
                          >
                            {product.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 font-semibold text-gray-900">
                      Product Attributes dan Attribute Values
                    </h3>

                    {preview.attributes.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Tidak ada Product Attribute yang ditetapkan.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {preview.attributes.map((attribute) => (
                          <div
                            key={attribute.id}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {attribute.name}
                              </span>

                              <span className="text-xs text-gray-500">
                                ({attribute.code})
                              </span>

                              {attribute.shared && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  Shared
                                </span>
                              )}
                            </div>

                            <p className="mt-2 text-xs text-gray-500">
                              Attribute Values
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {attribute.values.length === 0 ? (
                                <span className="text-sm text-gray-400">
                                  Belum ada Attribute Value.
                                </span>
                              ) : (
                                attribute.values.map((value) => (
                                  <span
                                    key={value.id}
                                    className="inline-flex items-center gap-1 rounded-md border bg-gray-50 px-2 py-1 text-xs text-gray-700"
                                  >
                                    {value.name}
                                    {value.shared && (
                                      <span className="font-medium text-blue-600">
                                        · Shared
                                      </span>
                                    )}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-500">
                      Shared berarti data master juga digunakan oleh produk
                      lain dan tidak akan ikut dihapus.
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-3 font-semibold text-gray-900">
                      Product Variants
                    </h3>

                    {preview.variants.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Tidak ada Product Variant.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {preview.variants.map((variant) => (
                          <div
                            key={variant.id}
                            className="rounded-lg border p-3"
                          >
                            <p className="font-medium text-gray-900">
                              {variant.name}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              Master Product: {variant.productName}
                            </p>

                            {variant.attributes.length > 0 && (
                              <p className="mt-2 text-sm text-gray-600">
                                {variant.attributes.join(" · ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-semibold text-amber-900">
                      Perhatian
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Penghapusan Product Model bersifat permanen. Master
                      Attribute dan Attribute Value merupakan master global
                      sehingga tidak otomatis dihapus. Riwayat transaksi,
                      inventory, purchase order, dan stock opname harus tetap
                      dipertahankan.
                    </p>
                  </div>

                  {hasBlockers && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="font-semibold text-red-800">
                        Penghapusan tidak dapat dilakukan
                      </p>

                      <p className="mt-1 text-sm text-red-700">
                        Terdapat data yang masih menggunakan Product Variant:
                      </p>

                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                        {preview.blockers.map((blocker) => (
                          <li key={blocker.name}>
                            {blocker.name}: {blocker.count} data
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!hasBlockers && hasProducts && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 p-3">
                      <input
                        type="checkbox"
                        checked={deleteMasterProducts}
                        onChange={(event) =>
                          setDeleteMasterProducts(event.target.checked)
                        }
                        disabled={deleting}
                        className="mt-1"
                      />

                      <span className="text-sm text-gray-800">
                        <strong>
                          Saya menyetujui penghapusan seluruh Master Product
                          yang terhubung dengan Product Model ini.
                        </strong>
                        <span className="mt-1 block text-xs text-gray-500">
                          Persetujuan ini wajib diberikan secara terpisah.
                        </span>
                      </span>
                    </label>
                  )}

                  {!hasBlockers && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) =>
                          setConfirmed(event.target.checked)
                        }
                        disabled={deleting}
                        className="mt-1"
                      />

                      <span className="text-sm text-gray-800">
                        Saya telah memeriksa rincian data dan menyetujui
                        penghapusan permanen Product Model ini.
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t p-5">
              <button
                type="button"
                onClick={handleClose}
                disabled={deleting}
                className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteDisabled}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Menghapus..." : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
