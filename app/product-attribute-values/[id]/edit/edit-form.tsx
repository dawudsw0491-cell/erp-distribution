
"use client";

import { useState } from "react";
import Link from "next/link";
import { updateProductAttributeValue } from "../../actions";

type Attribute = {
  id: string;
  attribute_code: string;
  attribute_name: string;
  is_active: boolean;
};

type AttributeValue = {
  id: string;
  attribute_id: string;
  value_code: string;
  value_name: string;
  description: string | null;
  is_active: boolean;
};

type Props = {
  item: AttributeValue;
  attributes: Attribute[];
};

export default function AttributeValueEditForm({
  item,
  attributes,
}: Props) {
  const [valueCode, setValueCode] = useState(item.value_code);
  const [valueName, setValueName] = useState(item.value_name);
  const [error, setError] = useState("");

  return (
    <form
      action={updateProductAttributeValue}
      className="max-w-3xl space-y-6"
      onSubmit={() => setError("")}
    >
      <input type="hidden" name="id" value={item.id} />

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
              defaultValue={item.attribute_id}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {attributes.map((attribute) => (
                <option key={attribute.id} value={attribute.id}>
                  {attribute.attribute_code} - {attribute.attribute_name}
                  {!attribute.is_active ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
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
              value={valueCode}
              onChange={(event) =>
                setValueCode(event.target.value.toUpperCase())
              }
              placeholder="Contoh: BLK, WHT, 128GB"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
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
              value={valueName}
              onChange={(event) => setValueName(event.target.value)}
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
              defaultValue={item.description ?? ""}
              placeholder="Keterangan tambahan (opsional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <p className="text-sm text-slate-500">Status saat ini</p>
            <span
              className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                item.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.is_active ? "Active" : "Inactive"}
            </span>
            <p className="mt-1 text-xs text-slate-500">
              Status tidak berubah melalui form edit ini.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href={`/product-attribute-values/${item.id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </Link>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </form>
  );
}
