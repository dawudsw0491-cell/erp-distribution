
"use client";

import { useState } from "react";
import Link from "next/link";
import { updateProductModel } from "../../actions";

type ProductModelEditFormProps = {
  model: {
    id: string;
    brandId: string;
    brandName: string;
    brandCode: string;
    modelCode: string;
    modelName: string;
    description: string;
  };
  productCount: number;
};

export default function ProductModelEditForm({
  model,
  productCount,
}: ProductModelEditFormProps) {
  const [modelCode, setModelCode] = useState(model.modelCode);
  const [modelName, setModelName] = useState(model.modelName);
  const [description, setDescription] = useState(
    model.description
  );

  return (
    <form action={updateProductModel} className="space-y-6">
      <input type="hidden" name="id" value={model.id} />

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-700">
          Brand
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="font-semibold text-slate-800">
            {model.brandName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {model.brandCode}
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Brand tidak dapat diubah melalui halaman Edit Product Model.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="model_code"
          className="block text-sm font-semibold text-slate-700"
        >
          Model Code <span className="text-red-500">*</span>
        </label>

        <input
          id="model_code"
          name="model_code"
          type="text"
          value={modelCode}
          onChange={(event) =>
            setModelCode(event.target.value.toUpperCase())
          }
          placeholder="Contoh: IPH-16"
          maxLength={50}
          required
          pattern="[A-Za-z0-9_-]+"
          title="Gunakan huruf, angka, tanda hubung, atau underscore."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <p className="text-xs text-slate-500">
          Maksimal 50 karakter. Kode unik dalam Brand yang sama.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="model_name"
          className="block text-sm font-semibold text-slate-700"
        >
          Model Name <span className="text-red-500">*</span>
        </label>

        <input
          id="model_name"
          name="model_name"
          type="text"
          value={modelName}
          onChange={(event) =>
            setModelName(event.target.value)
          }
          placeholder="Contoh: iPhone 16"
          maxLength={150}
          required
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <p className="text-xs text-slate-500">
          Maksimal 150 karakter. Nama unik dalam Brand yang sama.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="description"
          className="block text-sm font-semibold text-slate-700"
        >
          Description
        </label>

        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(event) =>
            setDescription(event.target.value)
          }
          placeholder="Masukkan deskripsi atau informasi tambahan model..."
          rows={4}
          maxLength={5000}
          className="w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <p className="text-xs text-slate-500">
          Opsional, maksimal 5.000 karakter.
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-slate-800">
          Relasi Product
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Product Model ini sedang digunakan oleh{" "}
          <strong>{productCount} produk</strong>.
          Perubahan informasi model tidak akan mengubah relasi produk.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href={`/product-models/${model.id}`}
          className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
}
