
"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createWarehouseAction,
  type WarehouseActionState,
} from "@/app/warehouses/actions";

const initialState: WarehouseActionState = {};

export default function NewWarehousePage() {
  const [state, formAction, isPending] = useActionState(
    createWarehouseAction,
    initialState
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            href="/warehouses"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            ← Kembali ke Master Warehouse
          </Link>

          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Tambah Warehouse
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Masukkan informasi lokasi penyimpanan dan distribusi persediaan.
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Informasi Warehouse
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Field bertanda * wajib diisi.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="warehouse_code"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Kode Warehouse *
              </label>
              <input
                id="warehouse_code"
                name="warehouse_code"
                type="text"
                required
                maxLength={30}
                placeholder="Contoh: WH-JKT-001"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="warehouse_name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Nama Warehouse *
              </label>
              <input
                id="warehouse_name"
                name="warehouse_name"
                type="text"
                required
                maxLength={150}
                placeholder="Contoh: Gudang Jakarta"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Alamat Warehouse
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="address"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Alamat Lengkap
                </label>
                <textarea
                  id="address"
                  name="address"
                  rows={3}
                  placeholder="Masukkan alamat lengkap..."
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label
                    htmlFor="city"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Kota
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="province"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Provinsi
                  </label>
                  <input
                    id="province"
                    name="province"
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="postal_code"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Kode Pos
                  </label>
                  <input
                    id="postal_code"
                    name="postal_code"
                    type="text"
                    maxLength={10}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Informasi Kontak
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="contact_person"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Contact Person
                </label>
                <input
                  id="contact_person"
                  name="contact_person"
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Nomor Telepon
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {state.error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {state.error}
            </div>
          )}

          <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-5 sm:flex-row">
            <Link
              href="/warehouses"
              className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : "Simpan Warehouse"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
