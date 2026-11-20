
"use client";

import Link from "next/link";
import { useState } from "react";
import { updateProductVariant } from "@/app/products/actions";

type EditVariantFormProps = {
  productId: string;
  variantId: string;
  variantSku: string;
  initialVariantName: string;
  initialBarcode: string;
  initialWarranty: string;
  warrantyTemplates: string[];
};

export default function EditVariantForm({
  productId,
  variantId,
  variantSku,
  initialVariantName,
  initialBarcode,
  initialWarranty,
  warrantyTemplates,
}: EditVariantFormProps) {
  const [variantName, setVariantName] = useState(initialVariantName);
  const [barcode, setBarcode] = useState(initialBarcode);
  const [warranty, setWarranty] = useState(initialWarranty);

  return (
    <form
      action={updateProductVariant}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="variant_id" value={variantId} />

      <div>
        <label
          htmlFor="variant_sku"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          SKU Variant
        </label>

        <input
          id="variant_sku"
          type="text"
          value={variantSku}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600"
        />

        <p className="mt-1 text-xs text-slate-500">
          SKU merupakan identitas tetap dan tidak dapat diubah.
        </p>
      </div>

      <div>
        <label
          htmlFor="variant_name"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Nama Variant <span className="text-red-500">*</span>
        </label>

        <input
          id="variant_name"
          name="variant_name"
          type="text"
          required
          maxLength={200}
          value={variantName}
          onChange={(event) => setVariantName(event.target.value)}
          placeholder="Contoh: Hitam 8GB"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <p className="mt-1 text-xs text-slate-500">
          Maksimal 200 karakter.
        </p>
      </div>

      <div>
        <label
          htmlFor="warranty"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Warranty
        </label>
        <input
          id="warranty"
          name="warranty"
          type="text"
          maxLength={100}
          list="warranty-template-options"
          value={warranty}
          onChange={(event) => setWarranty(event.target.value)}
          placeholder="Pilih template atau ketik warranty baru"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <datalist id="warranty-template-options">
          {warrantyTemplates.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <p className="mt-1 text-xs text-slate-500">
          Teks baru otomatis disimpan sebagai template setelah perubahan variant disimpan.
        </p>
      </div>

      <div>
        <label
          htmlFor="barcode"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Barcode
        </label>

        <input
          id="barcode"
          name="barcode"
          type="text"
          maxLength={100}
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
          placeholder="Masukkan barcode jika tersedia"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <p className="mt-1 text-xs text-slate-500">
          Opsional, maksimal 100 karakter.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          href={`/products/${productId}/variants/${variantId}`}
          className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
}
