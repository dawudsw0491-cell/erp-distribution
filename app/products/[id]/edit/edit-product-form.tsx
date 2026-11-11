
"use client";

import Link from "next/link";
import { updateProduct } from "../../actions";

type MasterOption = {
  id: string;
  category_name?: string;
  brand_name?: string;
};

type ProductData = {
  id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  category_id: string | null;
  brand_id: string | null;
  product_type: string;
  tracking_type: string;
  unit: string;
  minimum_stock: number;
  description: string | null;
};

type EditProductFormProps = {
  product: ProductData;
  categories: MasterOption[];
  brands: MasterOption[];
};

export default function EditProductForm({
  product,
  categories,
  brands,
}: EditProductFormProps) {
  return (
    <form action={updateProduct} className="w-full min-w-0 space-y-6">
      <input type="hidden" name="id" value={product.id} />

      {/* INFORMASI UTAMA PRODUK */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="sku"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            SKU
          </label>
          <input
            id="sku"
            type="text"
            value={product.sku}
            readOnly
            className="box-border w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            SKU tidak dapat diubah.
          </p>
        </div>

        <div className="min-w-0">
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
            maxLength={255}
            defaultValue={product.barcode ?? ""}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="product_name"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Nama Produk <span className="text-red-500">*</span>
          </label>
          <input
            id="product_name"
            name="product_name"
            type="text"
            required
            maxLength={255}
            defaultValue={product.product_name}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="category_id"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Kategori
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={product.category_id ?? ""}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Tanpa Kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.category_name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="brand_id"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Brand
          </label>
          <select
            id="brand_id"
            name="brand_id"
            defaultValue={product.brand_id ?? ""}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Tanpa Brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.brand_name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="product_type"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Jenis Produk
          </label>
          <select
            id="product_type"
            name="product_type"
            defaultValue={product.product_type}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="goods">Barang</option>
            <option value="service">Jasa</option>
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="tracking_type"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Metode Tracking
          </label>
          <select
            id="tracking_type"
            name="tracking_type"
            defaultValue={product.tracking_type}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="quantity">Kuantitas</option>
            <option value="imei">IMEI</option>
            <option value="serial">Serial Number</option>
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="unit"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Satuan <span className="text-red-500">*</span>
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            required
            maxLength={50}
            defaultValue={product.unit}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="minimum_stock"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Minimum Stock
          </label>
          <input
            id="minimum_stock"
            name="minimum_stock"
            type="number"
            min="0"
            step="any"
            defaultValue={String(product.minimum_stock ?? 0)}
            className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* DESKRIPSI */}
      <div className="min-w-0">
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product.description ?? ""}
          className="box-border w-full min-w-0 resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* TOMBOL AKSI */}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href={`/products/${product.id}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
}
