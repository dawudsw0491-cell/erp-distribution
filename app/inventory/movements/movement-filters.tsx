
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

type WarehouseOption = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type MovementFiltersProps = {
  warehouses: WarehouseOption[];
  initialQuery: string;
  initialType: string;
  initialStatus: string;
  initialWarehouse: string;
};

const movementLabels: Record<string, string> = {
  purchase: "Pembelian",
  sale: "Penjualan",
  transfer_in: "Barang Masuk",
  transfer_out: "Barang Keluar",
  adjustment: "Penyesuaian",
  customer_return: "Retur Pelanggan",
  supplier_return: "Retur Pemasok",
  opening_balance: "Stok Awal",
  status_change: "Perubahan Status",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  cancelled: "Cancelled",
};

export default function MovementFilters({
  warehouses,
  initialQuery,
  initialType,
  initialStatus,
  initialWarehouse,
}: MovementFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [warehouse, setWarehouse] = useState(initialWarehouse);



  const currentParams = searchParams.toString();
  const isSearching = query.trim() !== (searchParams.get("q") ?? "");

  // Sinkronisasi filter ketika navigasi browser atau pagination berubah.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(currentParams);
      setQuery(params.get("q") ?? "");
      setType(params.get("type") ?? "");
      setStatus(params.get("status") ?? "");
      setWarehouse(params.get("warehouse") ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentParams]);

  const updateUrl = useCallback(
    (values: {
      q: string;
      type: string;
      status: string;
      warehouse: string;
    }) => {
      const params = new URLSearchParams();

      if (values.q.trim()) {
        params.set("q", values.q.trim());
      }

      if (values.type) {
        params.set("type", values.type);
      }

      if (values.status) {
        params.set("status", values.status);
      }

      if (values.warehouse) {
        params.set("warehouse", values.warehouse);
      }

      // Setiap perubahan filter kembali ke halaman pertama.
      params.set("page", "1");

      const nextUrl = `${pathname}?${params.toString()}`;

      if (nextUrl !== `${pathname}?${currentParams}`) {
        router.replace(nextUrl, { scroll: false });
      }
    },
    [pathname, router, currentParams]
  );

  // Pencarian otomatis dengan debounce 400 ms.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(currentParams);

      const currentQuery = params.get("q") ?? "";

      if (currentQuery !== query.trim()) {
        updateUrl({
          q: query,
          type,
          status,
          warehouse,
        });
      }

    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    query,
    type,
    status,
    warehouse,
    currentParams,
    updateUrl,
  ]);

  function handleTypeChange(value: string) {
    setType(value);

    updateUrl({
      q: query,
      type: value,
      status,
      warehouse,
    });
  }

  function handleStatusChange(value: string) {
    setStatus(value);

    updateUrl({
      q: query,
      type,
      status: value,
      warehouse,
    });
  }

  function handleWarehouseChange(value: string) {
    setWarehouse(value);

    updateUrl({
      q: query,
      type,
      status,
      warehouse: value,
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">
            Pencarian dan Filter
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Hasil diperbarui otomatis ketika pencarian atau filter berubah.
          </p>
        </div>

        {isSearching && (
          <span className="inline-flex items-center gap-2 text-xs text-blue-600">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Mencari...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label
            htmlFor="movement-search"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Kata Kunci
          </label>

          <div className="relative">
            <input
              id="movement-search"
              type="search"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari referensi, SKU, produk..."
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="movement-type"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Jenis Movement
          </label>

          <select
            id="movement-type"
            value={type}
            onChange={(event) => handleTypeChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Semua Jenis</option>

            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="movement-status"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Status
          </label>

          <select
            id="movement-status"
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Semua Status</option>

            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="movement-warehouse"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Gudang
          </label>

          <select
            id="movement-warehouse"
            value={warehouse}
            onChange={(event) =>
              handleWarehouseChange(event.target.value)
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Semua Gudang</option>

            {warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.warehouse_code} - {item.warehouse_name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
