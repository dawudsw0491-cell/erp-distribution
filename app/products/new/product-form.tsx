
"use client";

import { useEffect, useState } from "react";
import {
  createBrand,
  createCategory,
  createProduct,
} from "../actions";

type CategoryOption = {
  id: string;
  category_name: string;
};

type BrandOption = {
  id: string;
  brand_name: string;
};

type MasterOption = {
  id: string;
  name: string;
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

type MasterSelectorProps = {
  label: string;
  fieldName: "category_id" | "brand_id";
  options: MasterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  createAction: (name: string) => Promise<CreateMasterResult>;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-1.5 block text-sm font-medium text-slate-700";

function MasterSelector({
  label,
  fieldName,
  options,
  value,
  onChange,
  createAction,
}: MasterSelectorProps) {
  const [items, setItems] = useState<MasterOption[]>(options);
  const [isManual, setIsManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(options);
  }, [options]);

  async function handleCreate() {
    const name = manualName.trim().replace(/\s+/g, " ").toUpperCase();

    if (!name || isSaving) {
      setError(`Nama ${label.toLowerCase()} wajib diisi.`);
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const result = await createAction(name);

      if (!result.success) {
        setError(result.error);
        return;
      }

      const newItem = {
        id: result.id,
        name: result.name,
      };

      setItems((current) => {
        if (current.some((item) => item.id === newItem.id)) {
          return current;
        }

        return [...current, newItem].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });

      onChange(result.id);
      setManualName(result.name);
      setIsManual(false);
      setError("");
    } catch (err) {
      console.error(`Create ${label} failed:`, err);
      setError(`Terjadi kesalahan saat menyimpan ${label.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSelect(value: string) {
    setError("");

    if (value === "__manual__") {
      setIsManual(true);
      setManualName("");
      onChange(null);
      return;
    }

    setIsManual(false);
    setManualName("");
    onChange(value || null);
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>

      <select
        value={isManual ? "__manual__" : value ?? ""}
        className={inputClass}
        onChange={(event) => handleSelect(event.target.value)}
      >
        <option value="">Pilih {label}</option>

        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}

        <option value="__manual__">+ Input Manual</option>
      </select>

      <input
        type="hidden"
        name={fieldName}
        value={value ?? ""}
      />

      {isManual && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={manualName}
            maxLength={255}
            className={inputClass}
            placeholder={`Masukkan nama ${label.toLowerCase()} baru`}
            onChange={(event) => {
              setManualName(event.target.value.toUpperCase());
              setError("");
            }}
          />

          <button
            type="button"
            disabled={isSaving || !manualName.trim()}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Menyimpan..."
              : `Simpan ${label}`}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ProductForm({
  categories,
  brands,
}: {
  categories: CategoryOption[];
  brands: BrandOption[];
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  const categoryOptions: MasterOption[] = categories.map((item) => ({
    id: item.id,
    name: item.category_name,
  }));

  const brandOptions: MasterOption[] = brands.map((item) => ({
    id: item.id,
    name: item.brand_name,
  }));

  return (
    <form action={createProduct} className="space-y-6">
      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 font-semibold text-slate-800">
          Informasi Produk
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>
              SKU <span className="text-red-600">*</span>
            </label>

            <input
              name="sku"
              required
              maxLength={255}
              className={inputClass}
              placeholder="Contoh: IPH-15-128-BLK"
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
              }}
            />
          </div>

          <div>
            <label className={labelClass}>Barcode</label>

            <input
              name="barcode"
              maxLength={255}
              className={inputClass}
              placeholder="Barcode produk"
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>
              Nama Produk <span className="text-red-600">*</span>
            </label>

            <input
              name="product_name"
              required
              maxLength={255}
              className={inputClass}
              placeholder="Nama lengkap produk"
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
              }}
            />
          </div>

          <MasterSelector
            label="Kategori"
            fieldName="category_id"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            createAction={createCategory}
          />

          <MasterSelector
            label="Brand"
            fieldName="brand_id"
            options={brandOptions}
            value={brandId}
            onChange={setBrandId}
            createAction={createBrand}
          />

          <div>
            <label className={labelClass}>Jenis Produk</label>

            <select
              name="product_type"
              defaultValue="goods"
              className={inputClass}
            >
              <option value="goods">Barang (Goods)</option>
              <option value="service">Jasa (Service)</option>
            </select>
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
            <label className={labelClass}>Satuan</label>

            <input
              name="unit"
              required
              maxLength={50}
              defaultValue="PCS"
              className={inputClass}
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
              }}
            />
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

          <div className="md:col-span-2">
            <label className={labelClass}>Deskripsi</label>

            <textarea
              name="description"
              rows={4}
              className={inputClass}
              placeholder="Keterangan produk (opsional)"
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
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
