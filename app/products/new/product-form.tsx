"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createBrand, createProduct, createProductModelInline } from "../actions";
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

type VariantDraft = {
  network: string;
  barcode: string;
  ram: string;
  rom: string;
  color: string;
  warranty: string;
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


function ProductModelSelector({
  models,
  brandId,
  value,
  disabled,
  onChange,
}: {
  models: ModelOption[];
  brandId: string;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [items, setItems] = useState(models);
  const [isManual, setIsManual] = useState(false);
  const [modelCode, setModelCode] = useState("");
  const [modelName, setModelName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!brandId || !modelCode.trim() || !modelName.trim() || isSaving) {
      setError("Pilih Brand, lalu isi kode dan nama Product Model.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const result = await createProductModelInline({
        brandId,
        modelCode: normalize(modelCode),
        modelName: normalize(modelName),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      const created: ModelOption = {
        id: result.id,
        brand_id: brandId,
        model_name: result.name,
        model_code: normalize(modelCode),
      };
      setItems((current) => [...current.filter((item) => item.id !== created.id), created]);
      onChange(created.id);
      setIsManual(false);
      setModelCode("");
      setModelName("");
    } catch (caught) {
      console.error("Create Product Model failed:", caught);
      setError("Terjadi kesalahan saat menyimpan Product Model.");
    } finally {
      setIsSaving(false);
    }
  }

  const availableModels = items.filter((item) => item.brand_id === brandId);

  return (
    <div>
      <label className={labelClass}>Product Model</label>
      <select
        name="model_id"
        value={isManual ? "__manual__" : value}
        disabled={disabled}
        className={inputClass}
        onChange={(event) => {
          if (event.target.value === "__manual__") {
            setIsManual(true);
            onChange("");
            setError("");
            return;
          }
          setIsManual(false);
          setError("");
          onChange(event.target.value);
        }}
      >
        <option value="">Tanpa Model</option>
        {availableModels.map((item) => (
          <option key={item.id} value={item.id}>
            {item.model_name} ({item.model_code})
          </option>
        ))}
        <option value="__manual__">+ Tambah Product Model</option>
      </select>

      {isManual && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            value={modelCode}
            maxLength={50}
            className={inputClass}
            placeholder="Kode model, contoh: IPHONE-16"
            onChange={(event) => {
              setModelCode(event.target.value.toUpperCase());
              setError("");
            }}
          />
          <input
            value={modelName}
            maxLength={150}
            className={inputClass}
            placeholder="Nama Product Model"
            onChange={(event) => {
              setModelName(event.target.value.toUpperCase());
              setError("");
            }}
          />
          <button
            type="button"
            disabled={isSaving || !brandId || !modelCode.trim() || !modelName.trim()}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Menyimpan..." : "Simpan Product Model"}
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Model mengikuti Brand yang dipilih dan dapat ditambahkan tanpa keluar dari Product Management.
      </p>
    </div>
  );
}


function SaveProductButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-live="polite"
      className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Menyimpan produk...
        </>
      ) : (
        "Simpan Produk"
      )}
    </button>
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
  const [variants, setVariants] = useState<VariantDraft[]>([{
    network: "", barcode: "", ram: "", rom: "", color: "", warranty: "",
  }]);

  function updateVariant(index: number, field: keyof VariantDraft, value: string) {
    setVariants((current) => current.map((variant, rowIndex) =>
      rowIndex === index ? { ...variant, [field]: value } : variant
    ));
  }

  const mainCategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.parent_id === null &&
          MAIN_PRODUCT_CATEGORIES.some((category) => category === item.category_name)
      ),
    [categories]
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
  }

  return (
    <form action={createProduct} className="space-y-6">
      <input type="hidden" name="variants_json" value={JSON.stringify(productType === "goods" ? variants : [])} />
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

          <ProductModelSelector
            models={models}
            brandId={brandId}
            value={modelId}
            disabled={!brandId || productType === "service"}
            onChange={setModelId}
          />

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

              <div className="md:col-span-2">
                {recommendation ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-900">
                      Rekomendasi Klasifikasi Produk
                    </p>

                    <p className="mt-2 text-sm text-slate-700">
                      {recommendation.categoryName}
                    </p>

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
                    Kategori utama mengidentifikasi jenis perangkat. Kondisi BARU atau SECOND dicatat terpisah sebagai identitas kondisi unit.
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
              defaultValue="Unit"
              className={inputClass}
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

      {productType === "goods" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
            <div><h2 className="font-semibold text-slate-800">Varian, SKU, Spesifikasi & Garansi</h2>
            <p className="mt-1 text-xs text-slate-500">Semua varian dibuat bersama produk. SKU varian dibuat otomatis setelah penyimpanan.</p></div>
            <button type="button" onClick={() => setVariants((current) => [...current, { variant_name: "", barcode: "", ram: "", rom: "", color: "", warranty: "" }])} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">+ Tambah Varian</button>
          </div>
          <div className="space-y-4">
            {variants.map((variant, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between"><h3 className="font-medium text-slate-800">Varian {index + 1}</h3>
                  {variants.length > 1 && <button type="button" onClick={() => setVariants((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="text-xs text-red-600 hover:underline">Hapus varian</button>}</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><label className={labelClass}>Network <span className="text-red-600">*</span></label><select required value={variant.network} onChange={(event) => updateVariant(index, "network", event.target.value)} className={inputClass}><option value="">Pilih Network</option><option value="4G">4G</option><option value="5G">5G</option><option value="WIFI ONLY">WIFI ONLY</option></select><p className="mt-1 text-xs text-slate-500">Pilih konektivitas produk. RAM, ROM, dan warna tetap diisi terpisah.</p></div>
                  <div><label className={labelClass}>Barcode</label><input maxLength={100} value={variant.barcode} onChange={(event) => updateVariant(index, "barcode", event.target.value)} className={inputClass} placeholder="Barcode (opsional)" /></div>
                  <div><label className={labelClass}>RAM</label><input maxLength={100} list="variant-ram-options" value={variant.ram} onChange={(event) => updateVariant(index, "ram", event.target.value)} className={inputClass} placeholder="Contoh: 8 GB" /></div>
                  <div><label className={labelClass}>ROM / Penyimpanan</label><input maxLength={100} list="variant-rom-options" value={variant.rom} onChange={(event) => updateVariant(index, "rom", event.target.value)} className={inputClass} placeholder="Contoh: 256 GB" /></div>
                  <div><label className={labelClass}>Warna</label><input maxLength={100} list="variant-color-options" value={variant.color} onChange={(event) => updateVariant(index, "color", event.target.value)} className={inputClass} placeholder="Contoh: Graphite" /></div>
                  <div><label className={labelClass}>Jenis Garansi</label><input maxLength={100} list="variant-warranty-options" value={variant.warranty} onChange={(event) => updateVariant(index, "warranty", event.target.value)} className={inputClass} placeholder="Pilih atau ketik garansi" /></div>
                </div>
              </div>
            ))}
          </div>
          <datalist id="variant-ram-options"><option value="2 GB"/><option value="3 GB"/><option value="4 GB"/><option value="6 GB"/><option value="8 GB"/><option value="12 GB"/><option value="16 GB"/></datalist>
          <datalist id="variant-rom-options"><option value="32 GB"/><option value="64 GB"/><option value="128 GB"/><option value="256 GB"/><option value="512 GB"/><option value="1 TB"/></datalist>
          <datalist id="variant-color-options"><option value="Black"/><option value="White"/><option value="Blue"/><option value="Silver"/><option value="Graphite"/></datalist>
          <datalist id="variant-warranty-options"><option value="SEIN"/><option value="TAM"/><option value="B-CELL"/><option value="DISTRIBUTOR"/><option value="INTERNASIONAL"/><option value="GARANSI TOKO"/><option value="TANPA GARANSI"/></datalist>
        </section>
      )}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href="/products"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <SaveProductButton />
      </div>
    </form>
  );
}
