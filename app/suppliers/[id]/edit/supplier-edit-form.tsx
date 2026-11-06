"use client";

import { useActionState, useEffect, useState } from "react";
import {
  searchSupplierRegionsAction,
  updateSupplierAction,
  type CreateSupplierState,
  type RegionLevel,
  type RegionOption,
} from "../../actions";

type SelectedRegion = {
  id: string;
  name: string;
} | null;

export type SupplierEditInitialData = {
  id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_type: "company" | "individual";
  legal_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  business_license_number: string | null;
  website: string | null;
  address: string;
  postal_code: string | null;
  payment_term_days: number;
  credit_limit: number;
  currency_code: string;
  province: SelectedRegion;
  regency: SelectedRegion;
  district: SelectedRegion;
  village: SelectedRegion;
};

type SupplierEditFormProps = {
  initialData: SupplierEditInitialData;
};

const initialState: CreateSupplierState = {
  error: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

type RegionFieldProps = {
  label: string;
  level: RegionLevel;
  selected: SelectedRegion;
  parentId: string;
  disabled?: boolean;
  onSelect: (value: RegionOption) => void;
};

function RegionField({
  label,
  level,
  selected,
  parentId,
  disabled = false,
  onSelect,
}: RegionFieldProps) {
  const [keyword, setKeyword] = useState(selected?.name ?? "");
  const [options, setOptions] = useState<RegionOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKeyword(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    if (!isOpen || disabled) {
      setOptions([]);
      setIsSearching(false);
      return;
    }

    if (level !== "province" && !parentId) {
      setOptions([]);
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setError("");

      try {
        const result = await searchSupplierRegionsAction(
          level,
          keyword,
          parentId
        );

        setOptions(result.data);
        setError(result.error);
      } catch {
        setOptions([]);
        setError("Gagal mengambil data wilayah.");
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [keyword, parentId, level, isOpen, disabled]);

  function handleSelect(option: RegionOption) {
    onSelect(option);
    setKeyword(option.name);
    setIsOpen(false);
    setOptions([]);
    setError("");
  }

  return (
    <div className="relative">
      <label className={labelClass}>{label}</label>

      <input
        type="text"
        className={inputClass}
        value={keyword}
        placeholder={`Cari ${label.toLowerCase()}...`}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setKeyword(event.target.value);
          setIsOpen(true);
        }}
      />

      {isOpen && !disabled && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isSearching && (
            <p className="px-3 py-3 text-sm text-slate-500">
              Mencari data...
            </p>
          )}

          {!isSearching && error && (
            <p className="px-3 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {!isSearching && !error && options.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-500">
              Data tidak ditemukan.
            </p>
          )}

          {!isSearching &&
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-blue-50"
                onClick={() => handleSelect(option)}
              >
                {option.name}
              </button>
            ))}
        </div>
      )}

      {isOpen && (
        <button
          type="button"
          aria-label={`Tutup pilihan ${label}`}
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setIsOpen(false)}
        />
      )}

      {selected && (
        <p className="mt-1 text-xs text-green-700">
          Terpilih: {selected.name}
        </p>
      )}
    </div>
  );
}

export default function SupplierEditForm({
  initialData,
}: SupplierEditFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateSupplierAction,
    initialState
  );

  const [province, setProvince] = useState<SelectedRegion>(
    initialData.province
  );

  const [regency, setRegency] = useState<SelectedRegion>(
    initialData.regency
  );

  const [district, setDistrict] = useState<SelectedRegion>(
    initialData.district
  );

  const [village, setVillage] = useState<SelectedRegion>(
    initialData.village
  );

  return (
    <form action={formAction} className="space-y-8">
      <input
        type="hidden"
        name="supplier_id"
        value={initialData.id}
      />

      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Informasi Supplier
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Perbarui identitas dan informasi dasar supplier.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Kode Supplier</label>
            <input
              type="text"
              value={initialData.supplier_code}
              disabled
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Nama Supplier *
            </label>
            <input
              name="supplier_name"
              type="text"
              required
              maxLength={200}
              defaultValue={initialData.supplier_name}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Jenis Supplier *
            </label>
            <select
              name="supplier_type"
              required
              defaultValue={initialData.supplier_type}
              className={inputClass}
            >
              <option value="company">Perusahaan</option>
              <option value="individual">Perorangan</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Nama Legal</label>
            <input
              name="legal_name"
              type="text"
              defaultValue={initialData.legal_name ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Contact Person</label>
            <input
              name="contact_person"
              type="text"
              defaultValue={initialData.contact_person ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Nomor Telepon</label>
            <input
              name="phone"
              type="tel"
              defaultValue={initialData.phone ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              name="email"
              type="email"
              defaultValue={initialData.email ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>NPWP</label>
            <input
              name="tax_number"
              type="text"
              defaultValue={initialData.tax_number ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Nomor Izin Usaha
            </label>
            <input
              name="business_license_number"
              type="text"
              defaultValue={
                initialData.business_license_number ?? ""
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Website</label>
            <input
              name="website"
              type="url"
              defaultValue={initialData.website ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Alamat Utama
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Perbarui alamat dan wilayah administratif supplier.
          </p>
        </div>

        <div>
          <label className={labelClass}>
            Alamat Jalan dan Detail *
          </label>
          <textarea
            name="address"
            required
            rows={3}
            defaultValue={initialData.address}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RegionField
            label="Provinsi *"
            level="province"
            selected={province}
            parentId=""
            disabled={isPending}
            onSelect={(value) => {
              setProvince(value);
              setRegency(null);
              setDistrict(null);
              setVillage(null);
            }}
          />

          <RegionField
            label="Kabupaten/Kota *"
            level="regency"
            selected={regency}
            parentId={province?.id ?? ""}
            disabled={!province || isPending}
            onSelect={(value) => {
              setRegency(value);
              setDistrict(null);
              setVillage(null);
            }}
          />

          <RegionField
            label="Kecamatan *"
            level="district"
            selected={district}
            parentId={regency?.id ?? ""}
            disabled={!regency || isPending}
            onSelect={(value) => {
              setDistrict(value);
              setVillage(null);
            }}
          />

          <RegionField
            label="Desa/Kelurahan *"
            level="village"
            selected={village}
            parentId={district?.id ?? ""}
            disabled={!district || isPending}
            onSelect={setVillage}
          />

          <div>
            <label className={labelClass}>Kode Pos</label>
            <input
              name="postal_code"
              type="text"
              maxLength={10}
              defaultValue={initialData.postal_code ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-800">
            Ringkasan Wilayah
          </p>
          <p className="mt-1 text-sm text-blue-700">
            {[
              village?.name,
              district?.name,
              regency?.name,
              province?.name,
            ]
              .filter(Boolean)
              .join(", ") || "Pilih wilayah alamat."}
          </p>
        </div>

        <input
          type="hidden"
          name="province_code"
          value={province?.id ?? ""}
        />
        <input
          type="hidden"
          name="regency_code"
          value={regency?.id ?? ""}
        />
        <input
          type="hidden"
          name="district_id"
          value={district?.id ?? ""}
        />
        <input
          type="hidden"
          name="village_id"
          value={village?.id ?? ""}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Informasi Pembayaran
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Atur termin pembayaran dan batas kredit supplier.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>
              Termin Pembayaran (Hari)
            </label>
            <input
              name="payment_term_days"
              type="number"
              min="0"
              step="1"
              defaultValue={initialData.payment_term_days}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Limit Kredit</label>
            <input
              name="credit_limit"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initialData.credit_limit}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Mata Uang</label>
            <input
              name="currency_code"
              type="text"
              maxLength={3}
              defaultValue={initialData.currency_code}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <a
          href={`/suppliers/${initialData.id}`}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Batal
        </a>

        <button
          type="submit"
          disabled={
            isPending ||
            !province ||
            !regency ||
            !district ||
            !village
          }
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}
