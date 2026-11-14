
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateProduct } from "../../actions";

type CategoryOption = {
  id: string;
  category_name: string;
  parent_id: string | null;
  is_active?: boolean;
};

type BrandOption = {
  id: string;
  brand_name: string;
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
};

const MAIN_CATEGORIES = [
  "SMARTPHONE",
  "TABLET",
  "AKSESORIS",
  "KOMPUTER DAN LAPTOP",
  "NETWORKING",
  "KOMPONEN ELEKTRONIK",
];

const inputClass =
  "box-border w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-2 block text-sm font-medium text-slate-700";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function getRecommendation(
  productName: string,
  brandName: string,
  condition: string,
  categories: CategoryOption[]
) {
  const name = normalize(productName);
  const brand = normalize(brandName);

  if (!name || !condition) return null;

  let mainCategory = "";
  let subcategory = "";

  if (
    /\b(IPAD|TABLET|GALAXY TAB|REDMI PAD|XIAOMI PAD)\b/.test(name)
  ) {
    mainCategory = "TABLET";
  } else if (
    /\b(MACBOOK|LAPTOP|NOTEBOOK|CHROMEBOOK|THINKPAD|VIVOBOOK|ZENBOOK)\b/.test(name)
  ) {
    mainCategory = "KOMPUTER DAN LAPTOP";
  } else if (
    /\b(ROUTER|SWITCH|ACCESS POINT|ACCESS-POINT|MODEM|ONT|OLT|REPEATER|MESH WIFI)\b/.test(name)
  ) {
    mainCategory = "NETWORKING";
  } else if (
    /\b(IC|MIKROKONTROLER|RESISTOR|KAPASITOR|TRANSISTOR|DIODE|PCB|ARDUINO|SENSOR|MOSFET)\b/.test(name)
  ) {
    mainCategory = "KOMPONEN ELEKTRONIK";
  } else if (
    /\b(AIRPODS|EARBUDS|HEADSET|HEADPHONE|EARPHONE|CHARGER|ADAPTER|CABLE|KABEL|CASE|COVER|POWERBANK|TEMPERED GLASS|SCREEN PROTECTOR|MOUSE|KEYBOARD|USB HUB|DOCKING)\b/.test(name)
  ) {
    mainCategory = "AKSESORIS";
  } else if (/\b(IPHONE)\b/.test(name)) {
    mainCategory = "SMARTPHONE";
    subcategory = "SMARTPHONE IOS";
  } else if (
    /\b(SMARTPHONE|GALAXY|REDMI|POCO|XIAOMI|OPPO|VIVO|REALME|INFINIX|TECNO)\b/.test(name) ||
    (
      ["SAMSUNG", "XIAOMI", "OPPO", "VIVO", "REALME", "INFINIX", "TECNO", "POCO"].includes(brand) &&
      /\b(A\d{1,2}|S\d{1,2}|NOTE|PRO|ULTRA|F\d{1,2}|C\d{1,2}|X\d{1,2})\b/.test(name)
    )
  ) {
    mainCategory = "SMARTPHONE";
    subcategory = "SMARTPHONE ANDROID";
  }

  if (!mainCategory) return null;

  if (condition === "SECOND") {
    subcategory = `${mainCategory} SECONDHAND`;
  }

  const main = categories.find(
    (item) =>
      item.category_name === mainCategory &&
      item.parent_id === null &&
      item.is_active !== false
  );

  if (!main) return null;

  const child = subcategory
    ? categories.find(
        (item) =>
          item.category_name === subcategory &&
          item.parent_id === main.id &&
          item.is_active !== false
      )
    : undefined;

  return {
    categoryId: main.id,
    categoryName: main.category_name,
    subcategoryId: child?.id ?? "",
    subcategoryName: child?.category_name ?? "",
    missingSubcategory: Boolean(subcategory && !child),
  };
}

export default function EditProductForm({
  product,
  categories,
  brands,
}: EditProductFormProps) {
  const initialCategory = categories.find(
    (item) => item.id === product.category_id
  );

  const initialBrand = brands.find(
    (item) => item.id === product.brand_id
  );

  const [productName, setProductName] = useState(product.product_name);
  const [brandId, setBrandId] = useState(product.brand_id ?? "");
  const [condition, setCondition] = useState(product.product_condition ?? "");
  const [productType, setProductType] = useState(product.product_type);
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(
    product.product_subcategory_id ?? ""
  );

  const selectedBrandName =
    brands.find((item) => item.id === brandId)?.brand_name ??
    initialBrand?.brand_name ??
    "";

  const mainCategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.parent_id === null &&
          MAIN_CATEGORIES.includes(item.category_name) &&
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
        ? getRecommendation(
            productName,
            selectedBrandName,
            condition,
            categories
          )
        : null,
    [productName, selectedBrandName, condition, categories, productType]
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
        <div className="min-w-0">
          <label htmlFor="sku" className={labelClass}>SKU</label>
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

        <div className="min-w-0">
          <label htmlFor="barcode" className={labelClass}>Barcode</label>
          <input
            id="barcode"
            name="barcode"
            maxLength={255}
            defaultValue={product.barcode ?? ""}
            className={inputClass}
          />
        </div>

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

        <div className="min-w-0">
          <label htmlFor="brand_id" className={labelClass}>Brand</label>
          <select
            id="brand_id"
            name="brand_id"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
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

        <div className="min-w-0">
          <label htmlFor="product_type" className={labelClass}>
            Jenis Produk
          </label>
          <select
            id="product_type"
            name="product_type"
            value={productType}
            onChange={(event) => setProductType(event.target.value)}
            className={inputClass}
          >
            <option value="goods">Barang</option>
            <option value="service">Jasa</option>
          </select>
        </div>

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
                <option value="">Belum ditentukan (data lama)</option>
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
                  !mainCategories.some((item) => item.id === initialCategory.id) && (
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
              <label htmlFor="product_subcategory_id" className={labelClass}>
                Subkategori
              </label>
              <select
                id="product_subcategory_id"
                name="product_subcategory_id"
                value={subcategoryId}
                onChange={(event) => setSubcategoryId(event.target.value)}
                disabled={!categoryId}
                className={inputClass}
              >
                <option value="">Tanpa Subkategori</option>
                {product.product_subcategory_id &&
                  !subcategories.some(
                    (item) => item.id === product.product_subcategory_id
                  ) &&
                  subcategoryId === product.product_subcategory_id && (
                    <option value={product.product_subcategory_id}>
                      Subkategori sebelumnya (Data lama)
                    </option>
                  )}
                {subcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
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
                      Subkategori yang sesuai belum tersedia atau tidak aktif.
                      Kategori utama tetap dapat digunakan.
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
                  Isi nama produk dan kondisi untuk memperoleh rekomendasi
                  klasifikasi berdasarkan master kategori yang tersedia.
                </p>
              )}
            </div>
          </>
        )}

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
      </div>

      <div className="min-w-0">
        <label htmlFor="description" className={labelClass}>Deskripsi</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product.description ?? ""}
          className={inputClass}
        />
      </div>

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
