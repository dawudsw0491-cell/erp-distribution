
"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createProductAttribute,
  type ProductAttributeActionState,
} from "../actions";

const initialState: ProductAttributeActionState = {
  success: false,
  message: "",
};

export default function AttributeForm() {
  const [state, formAction, pending] = useActionState(
    createProductAttribute,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.message && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.message}
        </div>
      )}

      <div>
        <label htmlFor="attribute_code" className="mb-2 block text-sm font-medium text-slate-700">
          Kode Atribut
        </label>
        <input
          id="attribute_code"
          name="attribute_code"
          type="text"
          placeholder="Contoh: COLOR"
          required
          maxLength={50}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {state.errors?.attribute_code && (
          <p className="mt-1 text-xs text-red-600">{state.errors.attribute_code}</p>
        )}
      </div>

      <div>
        <label htmlFor="attribute_name" className="mb-2 block text-sm font-medium text-slate-700">
          Nama Atribut
        </label>
        <input
          id="attribute_name"
          name="attribute_name"
          type="text"
          placeholder="Contoh: Warna"
          required
          maxLength={100}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {state.errors?.attribute_name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.attribute_name}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={1000}
          placeholder="Deskripsi atribut (opsional)"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {state.errors?.description && (
          <p className="mt-1 text-xs text-red-600">{state.errors.description}</p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
        <Link
          href="/product-attributes"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan Atribut"}
        </button>
      </div>
    </form>
  );
}
