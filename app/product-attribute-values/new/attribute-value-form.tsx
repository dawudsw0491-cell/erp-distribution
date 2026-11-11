
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProductAttributeValue } from "../actions";

type Attribute = {
  id: string;
  attribute_code: string;
  attribute_name: string;
};

type Props = {
  attributes: Attribute[];
};

const initialState: { error?: string } = {};

export default function AttributeValueForm({ attributes }: Props) {
  const [state, formAction, pending] = useActionState(
    createProductAttributeValue,
    initialState
  );

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <div>
            <label
              htmlFor="attribute_id"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Parent Attribute <span className="text-red-500">*</span>
            </label>

            <select
              id="attribute_id"
              name="attribute_id"
              required
              defaultValue=""
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>
                Pilih atribut
              </option>

              {attributes.map((attribute) => (
                <option key={attribute.id} value={attribute.id}>
                  {attribute.attribute_code} - {attribute.attribute_name}
                </option>
              ))}
            </select>

            {attributes.length === 0 && (
              <p className="mt-2 text-sm text-amber-600">
                Belum ada atribut aktif. Buat atau aktifkan atribut terlebih dahulu.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="value_code"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Value Code <span className="text-red-500">*</span>
            </label>

            <input
              id="value_code"
              name="value_code"
              type="text"
              required
              maxLength={50}
              pattern="[A-Za-z0-9_-]+"
              placeholder="Contoh: BLK, WHT, 128GB"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <p className="mt-1 text-xs text-slate-500">
              Gunakan huruf, angka, tanda hubung, atau garis bawah.
            </p>
          </div>

          <div>
            <label
              htmlFor="value_name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Value Name <span className="text-red-500">*</span>
            </label>

            <input
              id="value_name"
              name="value_name"
              type="text"
              required
              maxLength={100}
              placeholder="Contoh: Black, White, 128GB"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Description
            </label>

            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={1000}
              placeholder="Keterangan tambahan (opsional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {state.error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href="/product-attribute-values"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </Link>

          <button
            type="submit"
            disabled={pending || attributes.length === 0}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Menyimpan..." : "Simpan Attribute Value"}
          </button>
        </div>
      </div>
    </form>
  );
}
