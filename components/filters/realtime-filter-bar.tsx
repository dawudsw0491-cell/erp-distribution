"use client";

import { useEffect, useState, useTransition } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

export type RealtimeFilterOption = {
  value: string;
  label: string;
};

export type RealtimeFilterDefinition = {
  param: string;
  label: string;
  initialValue: string;
  options: RealtimeFilterOption[];
};

type RealtimeFilterBarProps = {
  initialKeyword: string;
  searchLabel: string;
  searchPlaceholder: string;
  filters: RealtimeFilterDefinition[];
  helperText?: string;
};

export default function RealtimeFilterBar({
  initialKeyword,
  searchLabel,
  searchPlaceholder,
  filters,
  helperText = "Hasil diperbarui otomatis saat pencarian atau filter berubah.",
}: RealtimeFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filterParamsKey = filters.map((filter) => filter.param).join("|");

  const [keyword, setKeyword] = useState(initialKeyword);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        filters.map((filter) => [filter.param, filter.initialValue])
      )
  );

  // The parent keys this component from the URL-backed filter state.
  // This avoids effect-driven state updates while keeping Back/Forward in sync.

  // Update the query after a short debounce; no submit or reset button is needed.
  useEffect(() => {
    const normalizedKeyword = keyword.trim();
    const filterParams = filterParamsKey ? filterParamsKey.split("|") : [];

    const urlAlreadyMatches =
      (searchParams.get("q") ?? "") === normalizedKeyword &&
      filterParams.every(
        (param) =>
          (searchParams.get(param) ?? "") === (filterValues[param] ?? "")
      );

    if (urlAlreadyMatches) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();

      if (normalizedKeyword) {
        params.set("q", normalizedKeyword);
      }

      for (const param of filterParams) {
        const value = (filterValues[param] ?? "").trim();

        if (value) {
          params.set(param, value);
        }
      }

      params.set("page", "1");

      startTransition(() => {
        router.replace(pathname + "?" + params.toString(), {
          scroll: false,
        });
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    keyword,
    filterValues,
    filterParamsKey,
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
        <p className="mt-1 text-sm text-slate-600">{helperText}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={filters.length === 1 ? "md:col-span-2" : ""}>
          <label
            htmlFor="realtime-filter-search"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            {searchLabel}
          </label>
          <input
            id="realtime-filter-search"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {filters.map((filter) => (
          <div key={filter.param}>
            <label
              htmlFor={"realtime-filter-" + filter.param}
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              {filter.label}
            </label>
            <select
              id={"realtime-filter-" + filter.param}
              value={filterValues[filter.param] ?? ""}
              onChange={(event) =>
                setFilterValues((current) => ({
                  ...current,
                  [filter.param]: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        {isPending ? "Memperbarui hasil..." : "Pencarian otomatis aktif"}
      </p>
    </section>
  );
}
