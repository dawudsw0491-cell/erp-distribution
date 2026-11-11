
"use client";

import { useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

type Props = {
  attributes: {
    id: string;
    attribute_code: string;
    attribute_name: string;
  }[];
  initialQuery: string;
  initialAttribute: string;
  initialStatus: string;
};

export default function AttributeValueFilters({
  attributes,
  initialQuery,
  initialAttribute,
  initialStatus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [attribute, setAttribute] = useState(initialAttribute);
  const [status, setStatus] = useState(initialStatus);

  const currentParams = searchParams.toString();

  // Sinkronisasi ketika pengguna menggunakan tombol Back/Forward browser.
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setAttribute(searchParams.get("attribute") ?? "");
    setStatus(searchParams.get("status") ?? "all");
  }, [currentParams, searchParams]);

  // Live Search dengan debounce 400 ms.
  useEffect(() => {
    const params = new URLSearchParams(currentParams);
    const currentQuery = params.get("q") ?? "";

    if (currentQuery === query.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      const nextParams = new URLSearchParams(currentParams);

      if (query.trim()) {
        nextParams.set("q", query.trim());
      } else {
        nextParams.delete("q");
      }

      nextParams.delete("page");

      const queryString = nextParams.toString();

      router.replace(
        queryString ? `${pathname}?${queryString}` : pathname,
        { scroll: false }
      );
    }, 400);

    return () => clearTimeout(timer);
  }, [query, currentParams, pathname, router]);

  // Dropdown langsung menerapkan filter.
  function applyDropdownFilter(
    key: "attribute" | "status",
    value: string
  ) {
    const params = new URLSearchParams(currentParams);

    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }

    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    params.delete("page");

    const queryString = params.toString();

    router.replace(
      queryString ? `${pathname}?${queryString}` : pathname,
      { scroll: false }
    );
  }

  function resetFilters() {
    setQuery("");
    setAttribute("");
    setStatus("all");

    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <label
            htmlFor="attribute-value-search"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Pencarian
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              ⌕
            </span>

            <input
              id="attribute-value-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kode atau nama nilai..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <p className="mt-1 text-xs text-slate-400">
            Pencarian otomatis setelah 400 ms.
          </p>
        </div>

        <div>
          <label
            htmlFor="attribute-filter"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Parent Attribute
          </label>

          <select
            id="attribute-filter"
            value={attribute}
            onChange={(event) => {
              const value = event.target.value;
              setAttribute(value);
              applyDropdownFilter("attribute", value);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          >
            <option value="">Semua Atribut</option>

            {attributes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.attribute_code} - {item.attribute_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="status-filter"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Status
          </label>

          <select
            id="status-filter"
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(value);
              applyDropdownFilter("status", value);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={resetFilters}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          Reset Filter
        </button>
      </div>
    </div>
  );
}
