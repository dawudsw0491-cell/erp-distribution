
"use client";

import { useActionState } from "react";
import {
  createProductAttributeValue,
  type AttributeValueActionState,
} from "./actions";

type ProductAttribute = {
  id: string;
  attribute_code: string;
  attribute_name: string;
};

type AttributeValueFormProps = {
  attributes: ProductAttribute[];
};

const initialState: AttributeValueActionState = {};

export default function AttributeValueForm({
  attributes,
}: AttributeValueFormProps) {
  const [state, formAction, pending] = useActionState(
    createProductAttributeValue,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="attribute_id"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Parent Attribute <span className="text-red-600">*</span>
        </label>

        <select
          id="attribute_id"
          name="attribute_id"
          required
          defaultValue=""
          disabled={pending || attributes.length === 0}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        >
          <option value="" disabled>
            Pilih Parent Attribute
          </option>

          {attributes.map((attribute) => (
            <option key={attribute.id} value={attribute.id}>
              {attribute.attribute_code} - {attribute.attribute_name}
            </option>
          ))}
        </select>

        {attributes.length === 0 && (
          <p className="mt-2 text-sm text-amber-700">
            Belum ada Parent Attribute aktif. Tambahkan Parent Attribute
            terlebih dahulu.
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="value_code"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Value Code <span className="text-red-600">*</span>
        </label>

        <input
          id="value_code"
          name="value_code"
          type="text"
          required
          maxLength={50}
          pattern="[A-Za-z0-9_-]+"
          placeholder="Contoh: BLACK, WHITE, 128GB"
          disabled={pending}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase outline-none transition placeholder:normal-case focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />

        <p className="mt-1 text-xs text-slate-500">
          Maksimal 50 karakter. Gunakan huruf, angka, - atau _.
        </p>
      </div>

      <div>
        <label
          htmlFor="value_name"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Value Name <span className="text-red-600">*</span>
        </label>

        <input
          id="value_name"
          name="value_name"
          type="text"
          required
          maxLength={100}
          placeholder="Contoh: Black, White, 128 GB"
          disabled={pending}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
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
          disabled={pending}
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
        <p className="mt-1 text-xs text-slate-500">
          Maksimal 1000 karakter.
        </p>
      </div>

      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <a
          href="/product-attribute-values"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Batal
        </a>

        <button
          type="submit"
          disabled={pending || attributes.length === 0}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan Attribute Value"}
        </button>
      </div>
    </form>
  );
}
