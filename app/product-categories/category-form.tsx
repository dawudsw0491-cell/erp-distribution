"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createProductCategory,
  updateProductCategory,
} from "./actions";

type CategoryOption = {
  id: string;
  category_name: string;
};

type CategoryFormProps = {
  mode: "create" | "edit";
  categories: CategoryOption[];
  category?: {
    id: string;
    category_code: string;
    category_name: string;
    description: string | null;
    parent_id: string | null;
  };
};

const MAIN_CATEGORIES = [
  "SMARTPHONE",
  "TABLET",
  "AKSESORIS",
  "KOMPUTER DAN LAPTOP",
  "NETWORKING",
  "KOMPONEN ELEKTRONIK",
] as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-1.5 block text-sm font-medium text-slate-700";

export default function CategoryForm({
  mode,
  categories,
  category,
}: CategoryFormProps) {
  const isEdit = mode === "edit";

  const initialType =
    category?.parent_id ? "subcategory" : "main";

  const [categoryType, setCategoryType] =
    useState<"main" | "subcategory">(initialType);

  const mainCategoryOptions = categories.filter((item) =>
    MAIN_CATEGORIES.includes(
      item.category_name as (typeof MAIN_CATEGORIES)[number]
    )
  );

  return (
    <form
      action={isEdit ? updateProductCategory : createProductCategory}
      className="space-y-6"
    >
      {isEdit && (
        <input
          type="hidden"
          name="id"
          value={category?.id ?? ""}
        />
      )}

      <section className="space-y-5">
        <div>
          <label htmlFor="category_type" className={labelClass}>
            Jenis Kategori <span className="text-red-600">*</span>
          </label>

          <select
            id="category_type"
            name="category_type"
            value={categoryType}
            onChange={(event) =>
              setCategoryType(
                event.target.value as "main" | "subcategory"
              )
            }
            className={inputClass}
            required
          >
            <option value="main">Kategori Utama</option>
            <option value="subcategory">Subkategori</option>
          </select>

          <p className="mt-1.5 text-xs text-slate-500">
            Pilih kategori utama untuk kelompok standar atau
            subkategori untuk pengelompokan yang lebih spesifik.
          </p>
        </div>

        {categoryType === "main" ? (
          <div>
            <label htmlFor="category_name" className={labelClass}>
              Nama Kategori Utama{" "}
              <span className="text-red-600">*</span>
            </label>

            <select
              id="category_name"
              name="category_name"
              required
              defaultValue={
                isEdit ? category?.category_name ?? "" : ""
              }
              className={inputClass}
            >
              <option value="" disabled>
                Pilih kategori utama
              </option>

              {MAIN_CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <p className="mt-1.5 text-xs text-slate-500">
              Nama kategori utama mengikuti standar master data
              HEXACORE dan tidak dapat diketik bebas.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="category_name" className={labelClass}>
              Nama Subkategori{" "}
              <span className="text-red-600">*</span>
            </label>

            <input
              id="category_name"
              name="category_name"
              required
              maxLength={255}
              defaultValue={
                category?.parent_id
                  ? category.category_name
                  : ""
              }
              className={inputClass}
              placeholder="Contoh: SMARTPHONE ANDROID"
              onChange={(event) => {
                event.target.value =
                  event.target.value.toUpperCase();
              }}
            />

            <p className="mt-1.5 text-xs text-slate-500">
              Nama subkategori dapat disesuaikan dengan
              kebutuhan pengelompokan produk.
            </p>
          </div>
        )}

        {categoryType === "subcategory" && (
          <div>
            <label htmlFor="parent_id" className={labelClass}>
              Kategori Induk{" "}
              <span className="text-red-600">*</span>
            </label>

            <select
              id="parent_id"
              name="parent_id"
              required
              defaultValue={category?.parent_id ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                Pilih kategori utama
              </option>

              {mainCategoryOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category_name}
                </option>
              ))}
            </select>

            {mainCategoryOptions.length === 0 ? (
              <p className="mt-1.5 text-xs text-red-600">
                Belum ada kategori utama aktif. Buat kategori utama
                terlebih dahulu sebelum membuat subkategori.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                Subkategori harus berada di bawah salah satu
                kategori utama.
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="description" className={labelClass}>
            Deskripsi
          </label>

          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={5000}
            defaultValue={category?.description ?? ""}
            className={inputClass}
            placeholder="Keterangan kategori (opsional)"
            onChange={(event) => {
              event.target.value =
                event.target.value.toUpperCase();
            }}
          />
        </div>

        {isEdit && (
          <div>
            <label htmlFor="category_code" className={labelClass}>
              Kode Kategori
            </label>

            <input
              id="category_code"
              value={category?.category_code ?? ""}
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-500`}
            />

            <p className="mt-1 text-xs text-slate-500">
              Kode kategori dibuat oleh sistem dan tidak dapat
              diubah.
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href={
            isEdit && category
              ? `/product-categories/${category.id}`
              : "/product-categories"
          }
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          disabled={
            categoryType === "subcategory" &&
            mainCategoryOptions.length === 0
          }
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEdit ? "Simpan Perubahan" : "Simpan Kategori"}
        </button>
      </div>
    </form>
  );
}