"use client";

import Link from "next/link";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  createSupplierAction,
  searchSupplierRegionsAction,
  searchSupplierPostalCodeAction,
  type RegionLevel,
  type RegionOption,
} from "../actions";

type SelectedRegion = {
  id: string;
  name: string;
};

const initialState = {
  error: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const regionLabels: Record<RegionLevel, string> = {
  province: "Provinsi",
  regency: "Kabupaten / Kota",
  district: "Kecamatan",
  village: "Desa / Kelurahan",
};

export default function SupplierForm() {
  const [state, formAction, isPending] = useActionState(
    createSupplierAction,
    initialState
  );

  const [province, setProvince] = useState<SelectedRegion | null>(null);
  const [regency, setRegency] = useState<SelectedRegion | null>(null);
  const [district, setDistrict] = useState<SelectedRegion | null>(null);
  const [village, setVillage] = useState<SelectedRegion | null>(null);

  const [activeLevel, setActiveLevel] = useState<RegionLevel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [options, setOptions] = useState<RegionOption[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [addressDetail, setAddressDetail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [postalSuggestion, setPostalSuggestion] = useState("");
  const [postalLookupError, setPostalLookupError] = useState("");
  const [isPostalLookupLoading, setIsPostalLookupLoading] = useState(false);

  const getParentId = useCallback((level: RegionLevel): string => {
    if (level === "province") return "";
    if (level === "regency") return province?.id ?? "";
    if (level === "district") return regency?.id ?? "";
    return district?.id ?? "";
  }, [province?.id, regency?.id, district?.id]);

  function getSelectedRegion(level: RegionLevel): SelectedRegion | null {
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
    setPostalCode("");
    setPostalSuggestion("");
    setPostalLookupError("");
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

  function selectRegion(level: RegionLevel, item: RegionOption) {
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
      setPostalCode("");
      setPostalSuggestion("");
      setPostalLookupError("");
      setIsPostalLookupLoading(true);
      void searchSupplierPostalCodeAction(item.id).then((result) => {
        setIsPostalLookupLoading(false);
        if (result.postalCode) {
          setPostalSuggestion(result.postalCode);
          setPostalCode(result.postalCode);
          setPostalLookupError("");
        } else {
          setPostalSuggestion("");
          setPostalLookupError(result.error || "Kode pos belum tersedia untuk wilayah ini.");
        }
      }).catch(() => {
        setIsPostalLookupLoading(false);
        setPostalLookupError("Gagal mengambil rekomendasi kode pos.");
      });
    }

    setSearchQuery("");
    setOptions([]);
    setSearchError("");
    setActiveLevel(null);
  }

  useEffect(() => {
    if (!activeLevel) return;

    const parentId = getParentId(activeLevel);
    const level = activeLevel;
    const keyword = searchQuery;

    if (level !== "province" && !parentId) return;
    if (keyword.trim().length < 2) {
      setOptions([]);
      setSearchError(keyword.trim().length === 0 ? "" : "Ketik minimal 2 huruf untuk mencari wilayah.");
      setIsSearching(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");

      try {
        const result = await searchSupplierRegionsAction(
          level,
          keyword,
          parentId
        );

        if (!cancelled) {
          setOptions(result.data);
          setSearchError(result.error);
        }
      } catch {
        if (!cancelled) {
          setOptions([]);
          setSearchError("Gagal menghubungi layanan data wilayah. Coba kembali.");
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 120);

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
    getParentId,
  ]);

  function renderRegionField(level: RegionLevel) {
    const selected = getSelectedRegion(level);

    const parentMissing =
      level === "regency" && !province ||
      level === "district" && !regency ||
      level === "village" && !district;

    const isOpen = activeLevel === level;

    const visibleOptions = parentMissing ? [] : options;
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
          {regionLabels[level]} <span className="text-red-600">*</span>
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
            className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {isSearching ? (
              <p className="px-3 py-3 text-sm text-slate-500">
                Mencari data wilayah...
              </p>
            ) : searchError ? (
              <p className="px-3 py-3 text-sm text-red-600">
                {searchError}
              </p>
            ) : visibleOptions.length > 0 ? (
              visibleOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected?.id === item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectRegion(level, item)}
                  className={`block w-full px-3 py-2.5 text-left text-sm transition hover:bg-blue-50 ${
                    selected?.id === item.id
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-700"
                  }`}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-slate-500">
                Data tidak ditemukan. Coba kata pencarian lain.
              </p>
            )}

            <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              Maksimal 50 hasil pencarian.
            </div>
          </div>
        )}

        {level !== "province" && (
          <p className="mt-1 text-xs text-slate-500">
            {level === "regency" && (
              province
                ? `Wilayah Provinsi ${province.name}`
                : "Pilih provinsi terlebih dahulu."
            )}
            {level === "district" && (
              regency
                ? `Wilayah ${regency.name}`
                : "Pilih kabupaten/kota terlebih dahulu."
            )}
            {level === "village" && (
              district
                ? `Wilayah Kecamatan ${district.name}`
                : "Pilih kecamatan terlebih dahulu."
            )}
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
    postalCode.trim() ? `Kode Pos ${postalCode.trim()}` : "",
  ].filter(Boolean).join(", ");

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
          Informasi Utama
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Kode Supplier</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              Dibuat otomatis oleh sistem setelah data disimpan.
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Jenis Supplier <span className="text-red-600">*</span>
            </label>
            <select
              name="supplier_type"
              required
              defaultValue="company"
              className={inputClass}
            >
              <option value="company">Perusahaan</option>
              <option value="individual">Perorangan</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>
              Nama Supplier <span className="text-red-600">*</span>
            </label>
            <input
              name="supplier_name"
              required
              maxLength={200}
              placeholder="Nama supplier"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Nama Legal</label>
            <input
              name="legal_name"
              maxLength={200}
              placeholder="Nama sesuai dokumen legal"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Nomor Izin Usaha</label>
            <input
              name="business_license_number"
              maxLength={100}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>NPWP / Nomor Pajak</label>
            <input
              name="tax_number"
              maxLength={100}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
          Informasi Kontak
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Contact Person</label>
            <input
              name="contact_person"
              maxLength={150}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Nomor Telepon</label>
            <input
              name="phone"
              type="tel"
              maxLength={30}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              name="email"
              type="email"
              maxLength={254}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Website</label>
            <input
              name="website"
              type="url"
              maxLength={255}
              placeholder="https://"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
          Alamat Supplier
        </h2>

        <div>
          <label className={labelClass}>
            Alamat Jalan dan Detail <span className="text-red-600">*</span>
          </label>
          <textarea
            value={addressDetail}
            onChange={(event) => setAddressDetail(event.target.value)}
            required
            maxLength={2000}
            rows={3}
            placeholder="Nama jalan, nomor rumah, gang, dusun, RT/RW, blok, dan detail lainnya"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderRegionField("province")}
          {renderRegionField("regency")}
          {renderRegionField("district")}
          {renderRegionField("village")}
        </div>

        <input type="hidden" name="address" value={fullAddress} />
        <input type="hidden" name="province_code" value={province?.id ?? ""} />
        <input type="hidden" name="regency_code" value={regency?.id ?? ""} />
        <input type="hidden" name="district_id" value={district?.id ?? ""} />
        <input type="hidden" name="village_id" value={village?.id ?? ""} />

        <div className="max-w-md">
          <label className={labelClass}>Kode Pos</label>
          <input
            name="postal_code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value.replace(/\\D/g, "").slice(0, 10))}
            inputMode="numeric"
            maxLength={10}
            placeholder="Contoh: 64111"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            {isPostalLookupLoading ? "Mencari rekomendasi kode pos..." : postalSuggestion ? `Kode pos wilayah terpilih: ${postalSuggestion}` : postalLookupError}
          </p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <p className="text-sm font-semibold text-blue-900">Ringkasan Alamat Lengkap</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800">{fullAddress || "Alamat belum diisi."}</p>
          <p className="mt-2 text-xs text-blue-700">Alamat diperbarui otomatis dari detail jalan, desa/kelurahan, kecamatan, kabupaten/kota, provinsi, dan kode pos.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
          Pengaturan Pembayaran
        </h2>

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
              defaultValue="0"
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
              defaultValue="0"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Mata Uang</label>
            <select
              name="currency_code"
              defaultValue="IDR"
              className={inputClass}
            >
              <option value="IDR">IDR - Rupiah</option>
              <option value="USD">USD - US Dollar</option>
              <option value="SGD">SGD - Singapore Dollar</option>
              <option value="EUR">EUR - Euro</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Link
          href="/suppliers"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Batal
        </Link>

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
          {isPending ? "Menyimpan..." : "Simpan Supplier"}
        </button>
      </div>
    </form>
  );
}
