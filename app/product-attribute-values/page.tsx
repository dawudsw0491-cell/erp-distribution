
import Link from "next/link";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import AttributeValueFilters from "./attribute-value-filters";
import DeleteAttributeValueButton from "./delete-attribute-value-button";

export const metadata = {
  title: "Product Attribute Values | HEXACORE",
};

export const instant = false;

type SearchParams = {
  q?: string;
  attribute?: string;
  status?: string;
  page?: string;
  error?: string;
  success?: string;
  deleted?: string;
};

const PAGE_SIZE = 10;

export default async function ProductAttributeValuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();

  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const attributeFilter = params.attribute ?? "";

  const statusFilter = ["all", "active", "inactive"].includes(
    params.status ?? ""
  )
    ? params.status ?? "all"
    : "all";

  const requestedPage = Math.max(1, Number(params.page) || 1);

  const auth = await getAuthorizationContext("master.view");

  const sidebar = <ErpSidebar activePath="/master-data" />;

  if (!auth.user) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        {sidebar}
        <main className="min-w-0 flex-1 p-6">
          <h1 className="text-xl font-semibold text-slate-800">
            Sesi Tidak Valid
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Silakan login kembali untuk mengakses halaman ini.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Login
          </Link>
        </main>
      </div>
    );
  }

  if (!auth.authorized) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        {sidebar}
        <main className="min-w-0 flex-1 p-6">
          <h1 className="text-xl font-semibold text-slate-800">
            Akses Ditolak
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Anda tidak memiliki izin untuk melihat Product Attribute Values.
          </p>
        </main>
      </div>
    );
  }

  const { supabase } = auth;

  const { data: attributes, error: attributeError } = await supabase
    .from("product_attributes")
    .select("id, attribute_code, attribute_name")
    .order("attribute_name");

  let valuesQuery = supabase
    .from("product_attribute_values")
    .select(
      `
        id,
        attribute_id,
        value_code,
        value_name,
        description,
        is_active,
        created_at,
        updated_at,
        product_attributes (
          id,
          attribute_code,
          attribute_name
        )
      `,
      { count: "exact" }
    );

  if (query) {
    valuesQuery = valuesQuery.or(
      `value_code.ilike.%${query}%,value_name.ilike.%${query}%`
    );
  }

  if (attributeFilter) {
    valuesQuery = valuesQuery.eq("attribute_id", attributeFilter);
  }

  if (statusFilter === "active") {
    valuesQuery = valuesQuery.eq("is_active", true);
  } else if (statusFilter === "inactive") {
    valuesQuery = valuesQuery.eq("is_active", false);
  }

  const { data: countData, error: countError } = await valuesQuery.select(
    "is_active"
  );

  if (attributeError || countError) {
    console.error("Product Attribute Values count error:", {
      attributeError,
      countError,
    });

    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        {sidebar}
        <main className="min-w-0 flex-1 p-6">
          <h1 className="text-xl font-semibold text-slate-800">
            Product Attribute Values
          </h1>
          <p className="mt-3 text-sm text-red-600">
            Gagal mengambil data. Silakan muat ulang halaman.
          </p>
        </main>
      </div>
    );
  }

  const totalRecords = countData?.length ?? 0;

  const activeCount =
    countData?.filter((item) => item.is_active).length ?? 0;

  const inactiveCount =
    countData?.filter((item) => !item.is_active).length ?? 0;

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  const currentPage = Math.min(requestedPage, totalPages);

  let listQuery = supabase
    .from("product_attribute_values")
    .select(
      `
        id,
        attribute_id,
        value_code,
        value_name,
        description,
        is_active,
        created_at,
        updated_at,
        product_attributes (
          id,
          attribute_code,
          attribute_name
        )
      `
    );

  if (query) {
    listQuery = listQuery.or(
      `value_code.ilike.%${query}%,value_name.ilike.%${query}%`
    );
  }

  if (attributeFilter) {
    listQuery = listQuery.eq("attribute_id", attributeFilter);
  }

  if (statusFilter === "active") {
    listQuery = listQuery.eq("is_active", true);
  } else if (statusFilter === "inactive") {
    listQuery = listQuery.eq("is_active", false);
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: values, error: valuesError } = await listQuery
    .order("value_name")
    .range(from, to);

  if (valuesError) {
    console.error("Product Attribute Values query error:", valuesError);

    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        {sidebar}
        <main className="min-w-0 flex-1 p-6">
          <h1 className="text-xl font-semibold text-slate-800">
            Product Attribute Values
          </h1>
          <p className="mt-3 text-sm text-red-600">
            Gagal mengambil data. Silakan muat ulang halaman.
          </p>
        </main>
      </div>
    );
  }

  function buildUrl(overrides: Partial<SearchParams> = {}) {
    const nextParams = {
      q: query,
      attribute: attributeFilter,
      status: statusFilter,
      page: String(currentPage),
      ...overrides,
    };

    const search = new URLSearchParams();

    Object.entries(nextParams).forEach(([key, value]) => {
      if (value && value !== "all") {
        search.set(key, value);
      }
    });

    const queryString = search.toString();

    return `/product-attribute-values${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
      {sidebar}

      <main className="min-w-0 flex-1 space-y-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Product Attribute Values
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Pengelolaan nilai standar untuk setiap atribut produk.
            </p>
          </div>

          <Link
            href="/product-attribute-values/new"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-700"
          >
            + Tambah Nilai Atribut
          </Link>
        </div>

        {params.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </div>
        )}

        {params.success === "deleted" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Attribute Value dengan kode {params.deleted ?? ""} berhasil dihapus permanen.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total Data</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {totalRecords}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Data Aktif</p>
            <p className="mt-2 text-2xl font-bold text-green-600">
              {activeCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Data Nonaktif</p>
            <p className="mt-2 text-2xl font-bold text-slate-500">
              {inactiveCount}
            </p>
          </div>
        </div>

        <AttributeValueFilters
          attributes={attributes ?? []}
          initialQuery={query}
          initialAttribute={attributeFilter}
          initialStatus={statusFilter}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama Nilai</th>
                  <th className="px-4 py-3">Atribut</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {(values ?? []).map((item) => {
                  const attribute = Array.isArray(item.product_attributes)
                    ? item.product_attributes[0] ?? null
                    : item.product_attributes;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {item.value_code}
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        {item.value_name}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">
                          {attribute?.attribute_code ?? "-"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {attribute?.attribute_name ?? "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-3">
                          <Link
                            href={`/product-attribute-values/${item.id}`}
                            className="font-medium text-blue-600 hover:text-blue-800"
                          >
                            Detail
                          </Link>

                          <DeleteAttributeValueButton
                            id={item.id}
                            valueName={item.value_name}
                            valueCode={item.value_code}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {(!values || values.length === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      Tidak ada data yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="text-slate-500">
              Menampilkan {values?.length ?? 0} dari {totalRecords} data.
            </p>

            <div className="flex items-center gap-2">
              <Link
                href={buildUrl({
                  page: String(Math.max(1, currentPage - 1)),
                })}
                aria-disabled={currentPage <= 1}
                className={`rounded-lg border px-3 py-1.5 ${
                  currentPage <= 1
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sebelumnya
              </Link>

              <span className="text-slate-600">
                {currentPage} / {totalPages}
              </span>

              <Link
                href={buildUrl({
                  page: String(Math.min(totalPages, currentPage + 1)),
                })}
                aria-disabled={currentPage >= totalPages}
                className={`rounded-lg border px-3 py-1.5 ${
                  currentPage >= totalPages
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Berikutnya
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
