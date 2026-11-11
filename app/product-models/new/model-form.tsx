
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createBrandForProductModel,
  createProductModel,
} from "../actions";

type Brand = {
  id: string;
  brand_name: string;
};

type ProductModelFormProps = {
  brands: Brand[];
};

export default function ProductModelForm({
  brands: initialBrands,
}: ProductModelFormProps) {
  const [brands, setBrands] = useState(initialBrands);

  const [brandId, setBrandId] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandOptions, setShowBrandOptions] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [brandMessage, setBrandMessage] = useState("");
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);

  const [modelCode, setModelCode] = useState("");
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");

  const selectedBrand = brands.find(
    (brand) => brand.id === brandId
  );

  const filteredBrands = brands.filter((brand) =>
    brand.brand_name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  async function handleCreateBrand() {
    setBrandMessage("");

    if (!newBrandName.trim()) {
      setBrandMessage("Nama Brand wajib diisi.");
      return;
    }

    setIsCreatingBrand(true);

    try {
      const result = await createBrandForProductModel(newBrandName);

      if (!result.success) {
        setBrandMessage(result.error);
        return;
      }

      const newBrand = {
        id: result.id,
        brand_name: result.name,
      };

      setBrands((current) => {
        const exists = current.some(
          (brand) => brand.id === newBrand.id
        );

        if (exists) return current;

        return [...current, newBrand].sort((a, b) =>
          a.brand_name.localeCompare(b.brand_name)
        );
      });

      setBrandId(result.id);
      setBrandSearch("");
      setNewBrandName("");
      setShowNewBrand(false);
      setShowBrandOptions(false);

      setBrandMessage(
        result.existing
          ? "Brand sudah tersedia dan berhasil dipilih."
          : "Brand baru berhasil ditambahkan."
      );
    } catch (error) {
      console.error("Create Brand failed:", error);
      setBrandMessage("Terjadi kesalahan saat membuat Brand.");
    } finally {
      setIsCreatingBrand(false);
    }
  }

  return (
    <form action={createProductModel} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="brand-search"
            className="block text-sm font-semibold text-slate-700"
          >
            Brand <span className="text-red-500">*</span>
          </label>

          <div className="relative">
            <input
              id="brand-search"
              type="text"
              value={
                showBrandOptions
                  ? brandSearch
                  : selectedBrand?.brand_name ?? ""
              }
              onChange={(event) => {
                setBrandSearch(event.target.value);
                setBrandId("");
                setShowBrandOptions(true);
              }}
              onFocus={() => {
                setBrandSearch("");
                setShowBrandOptions(true);
              }}
              placeholder="Cari atau pilih Brand..."
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            {showBrandOptions && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {filteredBrands.length > 0 ? (
                  filteredBrands.map((brand) => (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => {
                        setBrandId(brand.id);
                        setBrandSearch("");
                        setShowBrandOptions(false);
                        setBrandMessage("");
                      }}
                      className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-blue-50"
                    >
                      {brand.brand_name}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    Brand tidak ditemukan.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowBrandOptions(false);
                    setShowNewBrand(true);
                    setBrandMessage("");
                  }}
                  className="w-full border-t border-slate-200 px-4 py-3 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50"
                >
                  + Tambah Brand Baru
                </button>
              </div>
            )}
          </div>

          <input type="hidden" name="brand_id" value={brandId} />

          {showNewBrand && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Tambah Brand Baru
              </p>

              <input
                type="text"
                value={newBrandName}
                onChange={(event) =>
                  setNewBrandName(event.target.value)
                }
                placeholder="Contoh: APPLE"
                maxLength={255}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateBrand}
                  disabled={isCreatingBrand}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingBrand ? "Menyimpan..." : "Simpan Brand"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowNewBrand(false);
                    setNewBrandName("");
                    setBrandMessage("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {brandMessage && (
            <p
              role="status"
              className="text-xs text-slate-600"
            >
              {brandMessage}
            </p>
          )}

          <p className="text-xs text-slate-500">
            Pilih Brand yang sudah terdaftar atau tambahkan Brand baru.
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
            Kode unik untuk setiap model dalam satu Brand.
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
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
        </div>

        <div className="space-y-2 md:col-span-2">
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
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href="/product-models"
          className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          disabled={!brandId}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Simpan Product Model
        </button>
      </div>
    </form>
  );
}
