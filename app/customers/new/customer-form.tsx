
"use client";

import { useEffect, useState } from "react";
import {
  createCustomerAction,
  searchCustomerRegionsAction,
  type RegionLevel,
  type RegionOption,
} from "../actions";

type SelectedRegion = {
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400";

const labelClass =
  "mb-2 block text-sm font-medium text-gray-700";

const regionLabels: Record<RegionLevel, string> = {
  province: "Provinsi",
  regency: "Kabupaten / Kota",
  district: "Kecamatan",
  village: "Desa / Kelurahan",
};

export default function CustomerForm() {
  const [province, setProvince] =
    useState<SelectedRegion | null>(null);

  const [regency, setRegency] =
    useState<SelectedRegion | null>(null);

  const [district, setDistrict] =
    useState<SelectedRegion | null>(null);

  const [village, setVillage] =
    useState<SelectedRegion | null>(null);

  const [activeLevel, setActiveLevel] =
    useState<RegionLevel | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [options, setOptions] =
    useState<RegionOption[]>([]);

  const [searchError, setSearchError] = useState("");

  const [isSearching, setIsSearching] = useState(false);

  const [addressDetail, setAddressDetail] = useState("");

  const [postalCode, setPostalCode] = useState("");

  function getParentId(level: RegionLevel): string {
    if (level === "province") return "";
    if (level === "regency") return province?.id ?? "";
    if (level === "district") return regency?.id ?? "";
    return district?.id ?? "";
  }

  function getSelectedRegion(
    level: RegionLevel
  ): SelectedRegion | null {
    if (level === "province") return province;
    if (level === "regency") return regency;
    if (level === "district") return district;
    return village;
  }

  function openDropdown(level: RegionLevel) {
    const parentId = getParentId(level);

    if (level !== "province" && !parentId) return;

    const selected = getSelectedRegion(level);

    setActiveLevel(level);
    setSearchQuery(selected?.name ?? "");
    setOptions([]);
    setSearchError("");
  }

  function handleSearch(level: RegionLevel, value: string) {
    setActiveLevel(level);
    setSearchQuery(value);

    if (level === "province") {
      setProvince(null);
      setRegency(null);
      setDistrict(null);
      setVillage(null);
    }

    if (level === "regency") {
      setRegency(null);
      setDistrict(null);
      setVillage(null);
    }

    if (level === "district") {
      setDistrict(null);
      setVillage(null);
    }

    if (level === "village") {
      setVillage(null);
    }
  }

  function selectRegion(
    level: RegionLevel,
    item: RegionOption
  ) {
    const selected = {
      id: item.id,
      name: item.name,
    };

    if (level === "province") {
      setProvince(selected);
      setRegency(null);
      setDistrict(null);
      setVillage(null);
    }

    if (level === "regency") {
      setRegency(selected);
      setDistrict(null);
      setVillage(null);
    }

    if (level === "district") {
      setDistrict(selected);
      setVillage(null);
    }

    if (level === "village") {
      setVillage(selected);
    }

    setSearchQuery("");
    setOptions([]);
    setSearchError("");
    setActiveLevel(null);
  }

  useEffect(() => {
    if (!activeLevel) return;

    const level = activeLevel;
    const keyword = searchQuery;
    const parentId = getParentId(level);

    if (level !== "province" && !parentId) {
      setOptions([]);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");

      try {
        const result = await searchCustomerRegionsAction(
          level,
          keyword,
          parentId
        );

        if (!cancelled) {
          setOptions(result.data);
          setSearchError(result.error);
          setIsSearching(false);
        }
      } catch {
        if (!cancelled) {
          setOptions([]);
          setSearchError("Gagal menghubungi layanan data wilayah.");
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeLevel,
    searchQuery,
    province?.id,
    regency?.id,
    district?.id,
  ]);

  function renderRegionField(level: RegionLevel) {
    const selected = getSelectedRegion(level);
    const isOpen = activeLevel === level;

    const parentMissing =
      (level === "regency" && !province) ||
      (level === "district" && !regency) ||
      (level === "village" && !district);

    const placeholder = {
      province: "Ketik nama provinsi...",
      regency: "Ketik nama kabupaten / kota...",
      district: "Ketik nama kecamatan...",
      village: "Ketik nama desa / kelurahan...",
    }[level];

    const inputId = `${level}_search`;
    const optionsId = `${level}_options`;

    return (
      <div className="relative" key={level}>
        <label htmlFor={inputId} className={labelClass}>
          {regionLabels[level]}{" "}
          <span className="text-red-500">*</span>
        </label>

        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={optionsId}
          aria-autocomplete="list"
          autoComplete="off"
          value={
            isOpen
              ? searchQuery
              : selected?.name ?? ""
          }
          onFocus={() => openDropdown(level)}
          onChange={(event) =>
            handleSearch(level, event.target.value)
          }
          onBlur={() => {
            setTimeout(() => {
              setActiveLevel((current) =>
                current === level ? null : current
              );
            }, 150);
          }}
          disabled={Boolean(parentMissing)}
          placeholder={
            parentMissing
              ? "Pilih wilayah induk terlebih dahulu"
              : placeholder
          }
          className={inputClass}
        />

        {isOpen && (
          <div
            id={optionsId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            {isSearching ? (
              <p className="px-3 py-3 text-sm text-gray-500">
                Mencari data wilayah...
              </p>
            ) : searchError ? (
              <p className="px-3 py-3 text-sm text-red-600">
                {searchError}
              </p>
            ) : options.length > 0 ? (
              options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected?.id === item.id}
                  onMouseDown={(event) =>
                    event.preventDefault()
                  }
                  onClick={() => selectRegion(level, item)}
                  className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 ${
                    selected?.id === item.id
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-gray-700"
                  }`}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-gray-500">
                Data tidak ditemukan. Coba kata pencarian lain.
              </p>
            )}

            <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
              Maksimal 50 hasil pencarian.
            </div>
          </div>
        )}

        {level !== "province" && (
          <p className="mt-1 text-xs text-gray-500">
            {level === "regency" &&
              (province
                ? `Wilayah Provinsi ${province.name}`
                : "Pilih provinsi terlebih dahulu.")}

            {level === "district" &&
              (regency
                ? `Wilayah ${regency.name}`
                : "Pilih kabupaten/kota terlebih dahulu.")}

            {level === "village" &&
              (district
                ? `Wilayah Kecamatan ${district.name}`
                : "Pilih kecamatan terlebih dahulu.")}
          </p>
        )}
      </div>
    );
  }

  
const fullAddress = [
  addressDetail.trim(),
  village?.name,
  district?.name,
  regency?.name,
  province?.name,
  postalCode.trim()
    ? `Kode Pos ${postalCode.trim()}`
    : "",
]
  .filter((value) => Boolean(value && value.trim()))
  .join(", ");


  const regionSummary = [
    village?.name,
    district?.name,
    regency?.name,
    province?.name,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <form action={createCustomerAction} className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Informasi Pelanggan
        </h2>

        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">
            Kode Pelanggan Otomatis
          </p>
          <p className="mt-1 text-sm text-blue-700">
            Kode pelanggan akan dibuat otomatis oleh sistem
            setelah data berhasil disimpan.
          </p>
          <p className="mt-2 text-sm font-semibold text-blue-800">
            Format: CUST-00001
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
              placeholder="Masukkan nama pelanggan"
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
              defaultValue="individual"
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
              placeholder="Masukkan nomor NPWP"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Alamat Pelanggan
        </h2>

        <div className="space-y-5">
          <div>
            <label htmlFor="address_detail" className={labelClass}>
              Alamat Jalan dan Detail
            </label>
            <textarea
              id="address_detail"
              value={addressDetail}
              onChange={(event) =>
                setAddressDetail(event.target.value)
              }
              rows={3}
              maxLength={1500}
              placeholder="Nama jalan, nomor rumah, gang, RT/RW, dan detail lainnya"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {renderRegionField("province")}
            {renderRegionField("regency")}
            {renderRegionField("district")}
            {renderRegionField("village")}
          </div>

          <div className="max-w-md">
            <label htmlFor="postal_code" className={labelClass}>
              Kode Pos
            </label>
            <input
              id="postal_code"
              value={postalCode}
              onChange={(event) =>
                setPostalCode(
                  event.target.value.replace(/\D/g, "").slice(0, 10)
                )
              }
              inputMode="numeric"
              maxLength={10}
              placeholder="Contoh: 64111"
              className={inputClass}
            />
          </div>

          
<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
  <p className="text-sm font-semibold text-blue-900">
    Ringkasan Alamat Lengkap
  </p>

  <p className="mt-2 text-sm leading-relaxed text-gray-800">
    {fullAddress || "Alamat belum diisi."}
  </p>

  <p className="mt-2 text-xs text-blue-700">
    Ringkasan mencakup alamat detail, desa/kelurahan,
    kecamatan, kabupaten/kota, provinsi, dan kode pos
    sesuai data yang diisi.
  </p>
</div>


          <input
            type="hidden"
            name="province"
            value={province?.name ?? ""}
          />

          <input
            type="hidden"
            name="city"
            value={regency?.name ?? ""}
          />

          <input
            type="hidden"
            name="address"
            value={fullAddress}
          />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
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
              defaultValue="0"
              required
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
              defaultValue="0"
              required
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <a
          href="/customers"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Batal
        </a>

        <button
          type="submit"
          disabled={
            !province ||
            !regency ||
            !district ||
            !village
          }
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Simpan Pelanggan
        </button>
      </div>
    </form>
  );
}
