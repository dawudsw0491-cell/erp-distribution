
"use client";

import { useActionState } from "react";
import { updateProductAttribute } from "../../actions";

type ProductAttribute = {
  id: string;
  attribute_code: string;
  attribute_name: string;
  description: string | null;
  is_active: boolean;
};

type FormState = {
  success: boolean;
  message: string;
};

const initialState: FormState = {
  success: false,
  message: "",
};

export default function ProductAttributeEditForm({
  attribute,
}: {
  attribute: ProductAttribute;
}) {
  const updateAction = async (
    _previousState: FormState,
    formData: FormData
  ): Promise<FormState> => {
    try {
      await updateProductAttribute(formData);

      return {
        success: true,
        message: "Atribut berhasil diperbarui.",
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== "NEXT_REDIRECT"
      ) {
        return {
          success: false,
          message: error.message,
        };
      }

      throw error;
    }
  };

  const [state, formAction, isPending] = useActionState(
    updateAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={attribute.id} />

      <div>
        <label
          htmlFor="attribute_code"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Kode Atribut *
        </label>
        <input
          id="attribute_code"
          name="attribute_code"
          type="text"
          required
          maxLength={50}
          defaultValue={attribute.attribute_code}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500"
          placeholder="Contoh: COLOR"
        />
        <p className="mt-1 text-xs text-slate-500">
          Gunakan huruf kapital, angka, underscore, atau tanda hubung.
        </p>
      </div>

      <div>
        <label
          htmlFor="attribute_name"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Nama Atribut *
        </label>
        <input
          id="attribute_name"
          name="attribute_name"
          type="text"
          required
          maxLength={100}
          defaultValue={attribute.attribute_name}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          placeholder="Contoh: Color"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1000}
          defaultValue={attribute.description ?? ""}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          placeholder="Masukkan deskripsi atribut..."
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-700">
          Status Atribut
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {attribute.is_active
            ? "Aktif — atribut dapat digunakan untuk transaksi baru."
            : "Nonaktif — atribut tidak tersedia untuk penggunaan baru."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Perubahan status dilakukan melalui halaman Detail Atribut.
        </p>
      </div>

      {state.message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
        <a
          href={`/product-attributes/${attribute.id}`}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </a>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}
