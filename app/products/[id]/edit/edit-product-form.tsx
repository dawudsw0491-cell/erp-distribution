
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateProduct } from "../../actions";

type CategoryOption = ProductCategoryOption;

type BrandOption = {
  id: string;
  brand_name: string;
};

type ModelOption = {
  id: string;
  brand_id: string;
  model_name: string;
  model_code: string;
};

type ProductData = {
  id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  category_id: string | null;
  product_subcategory_id: string | null;
  product_condition: string | null;
  brand_id: string | null;
  model_id: string | null;
  product_type: string;
  tracking_type: string;
  unit: string;
  minimum_stock: number;
  description: string | null;
};

type EditProductFormProps = {
  product: ProductData;
  categories: CategoryOption[];
  brands: BrandOption[];
  models: ModelOption[];
};

import { MAIN_PRODUCT_CATEGORIES } from "@/lib/master-data/categories";
import { recommendProductCategory, type ProductCategoryOption } from "@/lib/master-data/product-classification";

const inputClass =
  "box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-2 block text-sm font-medium text-slate-700";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export default function EditProductForm({
  product,
  categories,
  brands,
  models,
}: EditProductFormProps) {
  const initialCategory = categories.find(
    (item) => item.id === product.category_id
  );

  const [productName, setProductName] = useState(product.product_name);
  const [brandId, setBrandId] = useState(product.brand_id ?? "");
  const [modelId, setModelId] = useState(product.model_id ?? "");
  const [condition, setCondition] = useState(
    product.product_condition ?? ""
  );
  const [productType, setProductType] = useState(product.product_type);
  const [categoryId, setCategoryId] = useState(
    product.category_id ?? ""
  );
  const [subcategoryId, setSubcategoryId] = useState(
    product.product_subcategory_id ?? ""
  );

  const selectedBrandName =
    brands.find((item) => item.id === brandId)?.brand_name ?? "";

  const mainCategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.parent_id === null &&
          MAIN_PRODUCT_CATEGORIES.includes(item.category_name as (typeof MAIN_PRODUCT_CATEGORIES)[number]) &&
          item.is_active !== false
      ),
    [categories]
  );

  const subcategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.parent_id === categoryId &&
          item.parent_id !== null &&
          item.is_active !== false
      ),
    [categories, categoryId]
  );

  const recommendation = useMemo(
    () =>
      productType === "goods"
        ? recommendProductCategory(
            productName,
            selectedBrandName,
            condition,
            categories
          )
        : null,
    [
      productName,
      selectedBrandName,
      condition,
      categories,
      productType,
    ]
  );

  function applyRecommendation() {
    if (!recommendation) return;

    setCategoryId(recommendation.categoryId);
    setSubcategoryId(recommendation.subcategoryId);
  }

  return (
    <form action={updateProduct} className="w-full min-w-0 space-y-6">
      <input type="hidden" name="id" value={product.id} />

      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        {/* SKU */}
        <div className="min-w-0">
          <label htmlFor="sku" className={labelClass}>
            SKU
          </label>
          <input
            id="sku"
            value={product.sku}
            readOnly
            className="box-border w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            SKU tidak dapat diubah.
          </p>
        </div>

        {/* Barcode */}
        <div className="min-w-0">
          <label htmlFor="barcode" className={labelClass}>
            Barcode
          </label>
          <input
            id="barcode"
            name="barcode"
            maxLength={255}
            defaultValue={product.barcode ?? ""}
            className={inputClass}
          />
        </div>

        {/* Product Name */}
        <div className="min-w-0 md:col-span-2">
          <label htmlFor="product_name" className={labelClass}>
            Nama Produk <span className="text-red-500">*</span>
          </label>
          <input
            id="product_name"
            name="product_name"
            required
            maxLength={255}
            value={productName}
            onChange={(event) =>
              setProductName(event.target.value.toUpperCase())
            }
            className={inputClass}
          />
        </div>

        {/* Brand */}
        <div className="min-w-0">
          <label htmlFor="brand_id" className={labelClass}>
            Brand
          </label>
          <select
            id="brand_id"
            name="brand_id"
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setModelId("");
            }}
            className={inputClass}
          >
            <option value="">Tanpa Brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.brand_name}
              </option>
            ))}
          </select>
        </div>

        {/* Product Model */}
        <div className="min-w-0">
          <label htmlFor="model_id" className={labelClass}>
            Product Model
          </label>
          <select
            id="model_id"
            name="model_id"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            disabled={!brandId || productType === "service"}
            className={inputClass}
          >
            <option value="">Tanpa Model</option>
            {models.filter((item) => item.brand_id === brandId).map((item) => (
              <option key={item.id} value={item.id}>
                {item.model_name} ({item.model_code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Model harus berasal dari Brand yang dipilih.
          </p>
        </div>

        {/* Product Type */}
        <div className="min-w-0">
          <label htmlFor="product_type" className={labelClass}>
            Jenis Produk
          </label>
          <select
            id="product_type"
            name="product_type"
            value={productType}
            onChange={(event) => {
              const nextType = event.target.value;
              setProductType(nextType);

              if (nextType === "service") {
                setCategoryId("");
                setSubcategoryId("");
              }
            }}
            className={inputClass}
          >
            <option value="goods">Barang</option>
            <option value="service">Jasa</option>
          </select>
        </div>

        {/* Goods Classification */}
        {productType === "goods" && (
          <>
            <div className="min-w-0">
              <label htmlFor="product_condition" className={labelClass}>
                Kondisi Produk
              </label>
              <select
                id="product_condition"
                name="product_condition"
                value={condition}
                onChange={(event) => {
                  setCondition(event.target.value);
                  setSubcategoryId("");
                }}
                className={inputClass}
              >
                <option value="">
                  Belum ditentukan (data lama)
                </option>
                <option value="BARU">BARU</option>
                <option value="SECOND">SECOND</option>
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor="category_id" className={labelClass}>
                Kategori Utama
              </label>
              <select
                id="category_id"
                name="category_id"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setSubcategoryId("");
                }}
                className={inputClass}
              >
                <option value="">Tanpa Kategori</option>

                {initialCategory &&
                  !mainCategories.some(
                    (item) => item.id === initialCategory.id
                  ) && (
                    <option value={initialCategory.id}>
                      {initialCategory.category_name} (Data lama)
                    </option>
                  )}

                {mainCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label
                htmlFor="product_subcategory_id"
                className={labelClass}
              >
                Subkategori
              </label>
              <select
                id="product_subcategory_id"
                name="product_subcategory_id"
                value={subcategoryId}
                onChange={(event) =>
                  setSubcategoryId(event.target.value)
                }
                disabled={!categoryId}
                className={inputClass}
              >
                <option value="">Tanpa Subkategori</option>

                {product.product_subcategory_id &&
                  !subcategories.some(
                    (item) =>
                      item.id === product.product_subcategory_id
                  ) &&
                  subcategoryId === product.product_subcategory_id && (
                    <option value={product.product_subcategory_id}>
                      Subkategori sebelumnya (Data lama)
                    </option>
                  )}

                {subcategories.map((subcategory) => (
                  <option
                    key={subcategory.id}
                    value={subcategory.id}
                  >
                    {subcategory.category_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Recommendation */}
            <div className="min-w-0 md:col-span-2">
              {recommendation ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-900">
                    Rekomendasi Klasifikasi Produk
                  </p>

                  <p className="mt-2 text-sm text-slate-700">
                    {recommendation.categoryName}
                    {recommendation.subcategoryName
                      ? ` → ${recommendation.subcategoryName}`
                      : ""}
                  </p>

                  {recommendation.missingSubcategory && (
                    <p className="mt-1 text-xs text-amber-700">
                      Subkategori yang sesuai belum tersedia atau tidak
                      aktif. Kategori utama tetap dapat digunakan.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={applyRecommendation}
                    className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Gunakan Rekomendasi
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Isi nama produk dan kondisi untuk memperoleh
                  rekomendasi klasifikasi berdasarkan master kategori
                  yang tersedia.
                </p>
              )}
            </div>
          </>
        )}

        {/* Goods Tracking and Minimum Stock */}
        {productType === "goods" ? (
          <>
            <div className="min-w-0">
              <label htmlFor="tracking_type" className={labelClass}>
                Metode Tracking
              </label>
              <select
                id="tracking_type"
                name="tracking_type"
                defaultValue={product.tracking_type}
                className={inputClass}
              >
                <option value="quantity">Kuantitas</option>
                <option value="imei">IMEI</option>
                <option value="serial">Serial Number</option>
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor="minimum_stock" className={labelClass}>
                Minimum Stock
              </label>
              <input
                id="minimum_stock"
                name="minimum_stock"
                type="number"
                min="0"
                step="any"
                defaultValue={String(product.minimum_stock ?? 0)}
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <>
            <input
              type="hidden"
              name="tracking_type"
              value="quantity"
            />
            <input
              type="hidden"
              name="minimum_stock"
              value="0"
            />
          </>
        )}

        {/* Unit */}
        <div className="min-w-0">
          <label htmlFor="unit" className={labelClass}>
            Satuan <span className="text-red-500">*</span>
          </label>
          <input
            id="unit"
            name="unit"
            required
            maxLength={50}
            defaultValue={product.unit}
            className={inputClass}
          />
        </div>
      </div>

      {/* Description */}
      <div className="min-w-0">
        <label htmlFor="description" className={labelClass}>
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product.description ?? ""}
          className={inputClass}
        />
      </div>

      {/* Actions */}
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
