
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

type ProductFiltersProps = {
  initialKeyword: string;
  initialStatus: string;
};

export default function ProductFilters({
  initialKeyword,
  initialStatus,
}: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState(initialKeyword);
  const [status, setStatus] = useState(initialStatus);

  const lastUrlState = useRef(
    `${initialKeyword}|${initialStatus}`
  );

  // Sinkronisasi saat pengguna memakai tombol Back/Forward browser.
  useEffect(() => {
    const urlKeyword = searchParams.get("q") ?? "";
    const urlStatus = searchParams.get("status") ?? "";
    const urlState = `${urlKeyword}|${urlStatus}`;

    if (urlState !== lastUrlState.current) {
      lastUrlState.current = urlState;
      setKeyword(urlKeyword);
      setStatus(urlStatus);
    }
  }, [searchParams]);

  // Pencarian otomatis dengan debounce 350 ms.
  useEffect(() => {
    const normalizedKeyword = keyword.trim();

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();

      if (normalizedKeyword) {
        params.set("q", normalizedKeyword);
      }

      if (status) {
        params.set("status", status);
      }

      params.set("page", "1");

      const queryString = params.toString();
      const nextUrl = `${pathname}?${queryString}`;

      const currentParams = new URLSearchParams(
        searchParams.toString()
      );

      const nextParams = new URLSearchParams(queryString);

      if (
        currentParams.toString() === nextParams.toString()
      ) {
        return;
      }

      lastUrlState.current = `${normalizedKeyword}|${status}`;

      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    keyword,
    status,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold text-slate-900">
          Pencarian dan Filter
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Cari SKU, barcode, nama produk, kategori, brand, jenis produk, atau tracking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-3">
          <label
            htmlFor="product-search"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Pencarian Produk
          </label>

          <input
            id="product-search"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="SKU, barcode, nama, kategori, brand, Barang, IMEI..."
            maxLength={100}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          {keyword.trim().length > 0 &&
            keyword.trim().length < 3 && (
              <p className="mt-1 text-xs text-slate-500">
                Masukkan minimal 3 karakter untuk mencari. Filter status tetap dapat digunakan.
              </p>
            )}
        </div>

        <div>
          <label
            htmlFor="product-status"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Status
          </label>

          <select
            id="product-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>

        <div className="md:col-span-4">
          <span
            className="text-xs text-slate-500"
            aria-live="polite"
          >
            {isPending
              ? "Memperbarui hasil..."
              : "Pencarian otomatis"}
          </span>
        </div>
      </div>
    </section>
  );
}
