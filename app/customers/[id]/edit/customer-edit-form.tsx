
"use client";

import Link from "next/link";
import { updateCustomerAction } from "../../actions";

type CustomerEditFormProps = {
  customer: {
    id: string;
    customer_code: string;
    customer_name: string;
    customer_type: "individual" | "company";
    phone: string | null;
    email: string | null;
    tax_number: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    payment_term_days: number;
    credit_limit: number | string;
  };
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-2 block text-sm font-medium text-gray-700";

export default function CustomerEditForm({
  customer,
}: CustomerEditFormProps) {
  return (
    <form action={updateCustomerAction} className="space-y-6">
      <input type="hidden" name="id" value={customer.id} />

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Informasi Pelanggan
        </h2>

        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">
            Kode Pelanggan
          </p>
          <p className="mt-1 break-all text-lg font-bold text-blue-700">
            {customer.customer_code}
          </p>
          <p className="mt-1 text-xs text-blue-700">
            Kode pelanggan dibuat otomatis dan tidak dapat diubah.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="customer_name" className={labelClass}>
              Nama Pelanggan <span className="text-red-500">*</span>
            </label>
            <input
              id="customer_name"
              name="customer_name"
              required
              maxLength={255}
              defaultValue={customer.customer_name}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="customer_type" className={labelClass}>
              Jenis Pelanggan <span className="text-red-500">*</span>
            </label>
            <select
              id="customer_type"
              name="customer_type"
              required
              defaultValue={customer.customer_type}
              className={inputClass}
            >
              <option value="individual">Perorangan</option>
              <option value="company">Perusahaan</option>
            </select>
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Nomor Telepon
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={customer.phone ?? ""}
              placeholder="Contoh: 081234567890"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              maxLength={255}
              defaultValue={customer.email ?? ""}
              placeholder="email@perusahaan.com"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tax_number" className={labelClass}>
              NPWP
            </label>
            <input
              id="tax_number"
              name="tax_number"
              type="text"
              maxLength={50}
              defaultValue={customer.tax_number ?? ""}
              placeholder="Nomor NPWP"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Alamat Pelanggan
        </h2>

        <div className="space-y-5">
          <div>
            <label htmlFor="address" className={labelClass}>
              Alamat Lengkap
            </label>
            <textarea
              id="address"
              name="address"
              rows={4}
              maxLength={1500}
              defaultValue={customer.address ?? ""}
              placeholder="Jalan, nomor rumah, RT/RW, desa, kecamatan, dan detail alamat lainnya"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="city" className={labelClass}>
                Kota / Kabupaten
              </label>
              <input
                id="city"
                name="city"
                maxLength={255}
                defaultValue={customer.city ?? ""}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="province" className={labelClass}>
                Provinsi
              </label>
              <input
                id="province"
                name="province"
                maxLength={255}
                defaultValue={customer.province ?? ""}
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-500">
            Data alamat awal dipertahankan. Silakan ubah hanya bagian
            yang memang perlu diperbarui.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Pengaturan Kredit dan Pembayaran
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="payment_term_days"
              className={labelClass}
            >
              Termin Pembayaran (Hari)
            </label>
            <input
              id="payment_term_days"
              name="payment_term_days"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={customer.payment_term_days}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              0 berarti pembayaran tunai.
            </p>
          </div>

          <div>
            <label htmlFor="credit_limit" className={labelClass}>
              Limit Kredit (IDR)
            </label>
            <input
              id="credit_limit"
              name="credit_limit"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={String(customer.credit_limit)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <Link
          href={`/customers/${customer.id}`}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Batal
        </Link>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
}
