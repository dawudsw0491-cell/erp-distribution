
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateWarehouseAction, type WarehouseActionState } from "../../actions";

type Warehouse = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  contact_person: string | null;
  phone: string | null;
};

export default function EditWarehouseForm({
  warehouse,
}: {
  warehouse: Warehouse;
}) {
  const action = updateWarehouseAction.bind(null, warehouse.id);

  const initialState: WarehouseActionState = {};

  const [state, formAction, isPending] = useActionState(
    action,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Kode Warehouse
        </label>
        <input
          value={warehouse.warehouse_code}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Kode warehouse tidak dapat diubah.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Nama Warehouse *
        </label>
        <input
          name="warehouse_name"
          required
          maxLength={150}
          defaultValue={warehouse.warehouse_name}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Alamat
        </label>
        <textarea
          name="address"
          rows={3}
          defaultValue={warehouse.address ?? ""}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Kota
          </label>
          <input
            name="city"
            defaultValue={warehouse.city ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Provinsi
          </label>
          <input
            name="province"
            defaultValue={warehouse.province ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Kode Pos
          </label>
          <input
            name="postal_code"
            defaultValue={warehouse.postal_code ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Contact Person
          </label>
          <input
            name="contact_person"
            defaultValue={warehouse.contact_person ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Nomor Telepon
          </label>
          <input
            name="phone"
            type="tel"
            defaultValue={warehouse.phone ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          href="/warehouses"
          className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </Link>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}
