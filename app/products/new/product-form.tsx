
"use client";

import { useMemo, useState } from "react";
import { createBrand, createProduct } from "../actions";
import { MAIN_PRODUCT_CATEGORIES } from "@/lib/master-data/categories";
import { recommendProductCategory, type ProductCategoryOption } from "@/lib/master-data/product-classification";

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

type CreateMasterResult =
  | {
      success: true;
      id: string;
      name: string;
      existing?: boolean;
    }
  | {
      success: false;
      error: string;
    };

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";



function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function BrandSelector({
  brands,
  value,
  onChange,
}: {
  brands: BrandOption[];
  value: string;
  onChange: (value: string, name: string) => void;
}) {
  const [items, setItems] = useState(brands);
  const [isManual, setIsManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    const name = normalize(manualName);

    if (!name || isSaving) {
      setError("Nama brand wajib diisi.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const result: CreateMasterResult = await createBrand(name);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setItems((current) => {
        if (current.some((item) => item.id === result.id)) return current;

        return [
          ...current,
          {
            id: result.id,
            brand_name: result.name,
          },
        ].sort((a, b) => a.brand_name.localeCompare(b.brand_name));
      });

      onChange(result.id, result.name);
      setIsManual(false);
      setManualName("");
    } catch (error) {
      console.error("Create brand failed:", error);
      setError("Terjadi kesalahan saat menyimpan brand.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <label className={labelClass}>Brand</label>

      <select
        value={isManual ? "__manual__" : value}
        className={inputClass}
        onChange={(event) => {
          const selected = items.find(
            (item) => item.id === event.target.value
          );

          if (event.target.value === "__manual__") {
            setIsManual(true);
            onChange("", "");
            return;
          }

          setIsManual(false);
          setError("");
          onChange(selected?.id ?? "", selected?.brand_name ?? "");
        }}
      >
        <option value="">Pilih Brand</option>

        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.brand_name}
          </option>
        ))}

        <option value="__manual__">+ Input Brand Baru</option>
      </select>

      <input type="hidden" name="brand_id" value={value} />

      {isManual && (
        <div className="mt-3 space-y-2">
          <input
            value={manualName}
            maxLength={255}
            className={inputClass}
            placeholder="Masukkan nama brand"
            onChange={(event) => {
              setManualName(event.target.value.toUpperCase());
              setError("");
            }}
          />

          <button
            type="button"
            disabled={isSaving || !manualName.trim()}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Menyimpan..." : "Simpan Brand"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

export default function ProductForm({
  categories,
  brands,
  models,
}: {
  categories: CategoryOption[];
  brands: BrandOption[];
  models: ModelOption[];
}) {
  const [productName, setProductName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelId, setModelId] = useState("");
  const [condition, setCondition] = useState("BARU");
  const [productType, setProductType] = useState("goods");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");

  const mainCategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.parent_id === null &&
          MAIN_PRODUCT_CATEGORIES.includes(item.category_name)
      ),
    [categories]
  );

  const subcategories = useMemo(
    () =>
      categories.filter(
        (item) => item.parent_id === categoryId
      ),
    [categories, categoryId]
  );

  const recommendation = useMemo(
    () =>
      productType === "goods"
        ? recommendProductCategory(
            productName,
            brandName,
            condition,
            categories
          )
        : null,
    [productName, brandName, condition, categories, productType]
  );

  function applyRecommendation() {
    if (!recommendation) return;

    setCategoryId(recommendation.categoryId);
    setSubcategoryId(recommendation.subcategoryId);
  }

  return (
    <form action={createProduct} className="space-y-6">
      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 font-semibold text-slate-800">
          Informasi Produk
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              SKU Otomatis
            </p>
            <p className="mt-1 text-sm text-blue-800">
              SKU akan dibuat oleh sistem saat produk disimpan.
              Setiap produk memiliki SKU unik dan tidak dapat diubah
              secara manual.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>
              Nama Produk <span className="text-red-600">*</span>
            </label>
            <input
              name="product_name"
              required
              maxLength={255}
              value={productName}
              className={inputClass}
              placeholder="Nama lengkap produk"
              onChange={(event) =>
                setProductName(event.target.value.toUpperCase())
              }
            />
          </div>

          <BrandSelector
            brands={brands}
            value={brandId}
            onChange={(id, name) => {
              setBrandId(id);
              setBrandName(name);
              setModelId("");
            }}
          />

          <div>
            <label className={labelClass}>Product Model</label>
            <select
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
              Model hanya menampilkan pilihan dari Brand yang dipilih.
            </p>
          </div>

          <div>
            <label className={labelClass}>Jenis Produk</label>
            <select
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
              <option value="goods">Barang (Goods)</option>
              <option value="service">Jasa (Service)</option>
            </select>
          </div>

          {productType === "goods" && (
            <>
              <div>
                <label className={labelClass}>
                  Kondisi Produk <span className="text-red-600">*</span>
                </label>
                <select
                  name="product_condition"
                  required
                  value={condition}
                  onChange={(event) => {
                    setCondition(event.target.value);
                    setSubcategoryId("");
                  }}
                  className={inputClass}
                >
                  <option value="BARU">BARU</option>
                  <option value="SECOND">SECOND</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Kategori Utama</label>
                <select
                  name="category_id"
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setSubcategoryId("");
                  }}
                  className={inputClass}
                >
                  <option value="">Pilih Kategori Utama</option>
                  {mainCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Subkategori</label>
                <select
                  name="product_subcategory_id"
                  value={subcategoryId}
                  disabled={!categoryId}
                  onChange={(event) =>
                    setSubcategoryId(event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="">Pilih Subkategori</option>
                  {subcategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.category_name}
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
                        Subkategori yang sesuai belum tersedia.
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
                    Isi nama produk dan kondisi untuk memperoleh
                    rekomendasi klasifikasi. Sistem hanya menggunakan
                    kategori yang sudah tersedia.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Metode Tracking</label>
                <select
                  name="tracking_type"
                  defaultValue="quantity"
                  className={inputClass}
                >
                  <option value="quantity">Quantity</option>
                  <option value="imei">IMEI</option>
                  <option value="serial">Serial Number</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Minimum Stock</label>
                <input
                  name="minimum_stock"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {productType === "service" && (
            <>
              <input type="hidden" name="tracking_type" value="quantity" />
              <input type="hidden" name="minimum_stock" value="0" />
            </>
          )}

          <div>
            <label className={labelClass}>Satuan</label>
            <input
              name="unit"
              required
              maxLength={50}
              defaultValue="PCS"
              className={inputClass}
              onChange={(event) => {
                event.target.value =
                  event.target.value.toUpperCase();
              }}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Deskripsi</label>
            <textarea
              name="description"
              rows={4}
              className={inputClass}
              placeholder="Keterangan produk (opsional)"
              onChange={(event) => {
                event.target.value =
                  event.target.value.toUpperCase();
              }}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <a
          href="/products"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </a>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Simpan Produk
        </button>
      </div>
    </form>
  );
}
