
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
  initialSpecifications: Record<string, string>;
  specificationOptions: Record<string, string[]>;
};

export default function EditVariantForm({
  productId,
  variantId,
  variantSku,
  initialVariantName,
  initialBarcode,
  initialSpecifications,
  specificationOptions,
}: EditVariantFormProps) {
  const [variantName, setVariantName] = useState(initialVariantName);
  const [barcode, setBarcode] = useState(initialBarcode);
  const [specifications, setSpecifications] = useState(initialSpecifications);

  const specificationFields = [
    { code: "RAM", label: "RAM", placeholder: "Contoh: 8GB" },
    { code: "ROM", label: "ROM", placeholder: "Contoh: 128GB" },
    { code: "COLOR", label: "Warna", placeholder: "Contoh: Midnight Black" },
    { code: "WARRANTY", label: "Warranty", placeholder: "Pilih template atau ketik warranty baru" },
  ] as const;

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

      <section className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div>
          <h2 className="font-semibold text-slate-800">Spesifikasi Varian</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nilai baru disimpan sebagai template reusable. Menghapus isi field akan menghapus relasi spesifikasi pada varian ini, bukan template global.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {specificationFields.map((field) => (
            <div key={field.code}>
              <label
                htmlFor={`spec-${field.code.toLowerCase()}`}
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                {field.label}
              </label>
              <input
                id={`spec-${field.code.toLowerCase()}`}
                name={`spec_${field.code}`}
                type="text"
                maxLength={100}
                list={`spec-options-${field.code.toLowerCase()}`}
                value={specifications[field.code] ?? ""}
                onChange={(event) =>
                  setSpecifications((previous) => ({
                    ...previous,
                    [field.code]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <datalist id={`spec-options-${field.code.toLowerCase()}`}>
                {(specificationOptions[field.code] ?? []).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
          ))}
        </div>
      </section>

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
