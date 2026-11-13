
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import DeleteProductModelButton from "./delete-product-model-button";

export const metadata = {
  title: "Product Models | DAWUD ERP",
  description: "Master data model produk ERP Distribution",
};

type ProductModelsPageProps = {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    status?: string;
    page?: string;
    error?: string;
    success?: string;
  }>;
};

type ProductModelRow = {
  id: string;
  brand_id: string;
  model_code: string;
  model_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  brand: {
    brand_name: string;
  } | null;
  products: {
    count: number;
  }[];
};

const PAGE_SIZE = 10;

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    brand: string;
    status: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.status) params.set("status", filters.status);

  params.set("page", String(page));

  return `/product-models?${params.toString()}`;
}

function getErrorMessage(error: string) {
  const messages: Record<string, string> = {
    forbidden: "Anda tidak memiliki izin untuk mengelola Product Model.",
    "invalid-id": "ID Product Model tidak valid.",
    "invalid-status": "Status Product Model tidak valid.",
    "update-failed": "Gagal mengubah status Product Model.",
    "record-changed":
      "Data telah berubah atau tidak ditemukan. Muat ulang halaman.",
    "delete-failed": "Gagal menghapus Product Model.",
    "delete-blocked":
      "Penghapusan ditolak karena data masih digunakan dalam transaksi atau persediaan.",
  };

  return messages[error] ?? "Terjadi kesalahan.";
}

async function ProductModelsContent({
  searchParams,
}: ProductModelsPageProps) {
  await connection();

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("master.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-models" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat Product Model.
              Silakan hubungi administrator sistem.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [
    params,
    createPermissionResult,
    updatePermissionResult,
    deletePermissionResult,
    totalResult,
    activeResult,
    inactiveResult,
    brandsResult,
  ] = await Promise.all([
    searchParams,

    supabase.rpc("has_permission", {
      required_permission: "master.create",
    }),

    supabase.rpc("has_permission", {
      required_permission: "master.update",
    }),

    supabase.rpc("has_permission", {
      required_permission: "master.delete",
    }),

    supabase
      .from("product_models")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("product_models")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("product_models")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false),

    supabase
      .from("brands")
      .select("id, brand_name")
      .eq("is_active", true)
      .order("brand_name", { ascending: true }),
  ]);

  const canCreate = createPermissionResult.data === true;
  const canUpdate = updatePermissionResult.data === true;
  const canDelete = deletePermissionResult.data === true;

  const keyword = (params.q ?? "").trim().slice(0, 100);
  const brandId = (params.brand ?? "").trim();

  const status = ["active", "inactive"].includes(params.status ?? "")
    ? params.status!
    : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const safeKeyword = keyword.replace(/[,%()]/g, "").trim();

  if (
    totalResult.error ||
    activeResult.error ||
    inactiveResult.error ||
    brandsResult.error
  ) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-models" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Product Models
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil ringkasan Product Model
              atau daftar Brand.
            </p>
          </div>
        </main>
      </div>
    );
  }

  let modelQuery = supabase
    .from("product_models")
    .select(
      `
        id,
        brand_id,
        model_code,
        model_name,
        description,
        is_active,
        created_at,
        brand:brands!product_models_brand_id_fkey(brand_name),
        products(count)
      `,
      { count: "exact" }
    )
    .order("model_name", { ascending: true });

  if (safeKeyword) {
    const pattern = `%${safeKeyword}%`;

    modelQuery = modelQuery.or(
      [
        `model_code.ilike.${pattern}`,
        `model_name.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (brandId) {
    modelQuery = modelQuery.eq("brand_id", brandId);
  }

  if (status === "active") {
    modelQuery = modelQuery.eq("is_active", true);
  }

  if (status === "inactive") {
    modelQuery = modelQuery.eq("is_active", false);
  }

  const offset = (requestedPage - 1) * PAGE_SIZE;

  const {
    data: models,
    error,
    count,
  } = await modelQuery.range(
    offset,
    offset + PAGE_SIZE - 1
  );

  if (error) {
    console.error("Gagal mengambil Product Models:", error);

    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-models" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Data Product Model
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Data tidak dapat diambil dari database. Periksa relasi
              Brand dan Product Model serta konfigurasi database.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const totalModels = totalResult.count ?? 0;
  const activeModels = activeResult.count ?? 0;
  const inactiveModels = inactiveResult.count ?? 0;

  const filteredTotal = count ?? 0;
  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE);

  const currentPage = Math.min(
    requestedPage,
    Math.max(totalPages, 1)
  );

  const filters = {
    q: keyword,
    brand: brandId,
    status,
  };

  if (requestedPage !== currentPage) {
    redirect(buildPageUrl(currentPage, filters));
  }

  const modelRows = (models ?? []) as unknown as ProductModelRow[];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-models" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Master Product Model
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Pengelolaan model perangkat berdasarkan Brand.
              </p>
            </div>

            {canCreate && (
              <Link
                href="/product-models/new"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                + Tambah Product Model
              </Link>
            )}
          </header>

          {params.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(params.error)}
            </div>
          )}

          {params.success === "status-updated" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Status Product Model berhasil diperbarui.
            </div>
          )}

          {params.success === "deleted" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Product Model berhasil dihapus.
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-300 bg-slate-100 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Total Model
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {totalModels}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Model Aktif
              </p>

              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {activeModels}
              </p>
            </div>

            <div className="rounded-xl border border-red-400 bg-red-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Model Nonaktif
              </p>

              <p className="mt-2 text-2xl font-bold text-red-700">
                {inactiveModels}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-900">
                Pencarian dan Filter
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Cari berdasarkan kode model, nama model, atau Brand.
              </p>
            </div>

            <form
              action="/product-models"
              method="GET"
              className="grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              <div>
                <label
                  htmlFor="model-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kata Kunci
                </label>

                <input
                  id="model-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  placeholder="Kode atau nama model..."
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="model-brand"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Brand
                </label>

                <select
                  id="model-brand"
                  name="brand"
                  defaultValue={brandId}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Brand</option>

                  {brandsResult.data?.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.brand_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="model-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>

                <select
                  id="model-status"
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2 md:col-span-3">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>

                <Link
                  href="/product-models"
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Daftar Product Model
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Menampilkan {filteredTotal === 0 ? 0 : offset + 1}
                  {" - "}
                  {Math.min(offset + PAGE_SIZE, filteredTotal)}
                  {" dari "}
                  {filteredTotal} model.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                Maksimal {PAGE_SIZE} data per halaman
              </span>
            </div>

            {filteredTotal === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="font-semibold text-slate-800">
                  Product Model tidak ditemukan
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Ubah kata kunci atau filter pencarian.
                </p>

                <Link
                  href="/product-models"
                  className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Tampilkan semua model
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-sm">
                    <thead className="bg-slate-50 text-slate-900">
                      <tr>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Brand
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Model Code
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Model Name
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Jumlah Produk
                        </th>

                        {(canUpdate || canDelete) && (
                          <th className="whitespace-nowrap px-5 py-4 font-semibold">
                            Aksi
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {modelRows.map((model) => (
                        <tr
                          key={model.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {model.brand?.brand_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 font-semibold">
                            <Link
                              href={`/product-models/${model.id}`}
                              className="text-blue-700 hover:text-blue-900 hover:underline"
                              title="Lihat detail Product Model"
                            >
                              {model.model_code}
                            </Link>
                          </td>

                          <td className="px-5 py-4 font-medium text-slate-900">
                            <div>{model.model_name}</div>

                            {model.description && (
                              <div className="mt-1 text-xs text-slate-500">
                                {model.description}
                              </div>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                      {model.products?.[0]?.count ?? 0}
</td>

{(canUpdate || canDelete) && (
  <td className="whitespace-nowrap px-5 py-4">
    <div className="flex items-center justify-center gap-2">
      {canUpdate && (
        <Link
          href={`/product-models/${model.id}/edit`}
          className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          Edit
        </Link>
      )}

      {canDelete && (
        <DeleteProductModelButton
          modelId={model.id}
          modelCode={model.model_code}
        />
      )}
    </div>
  </td>
)}
</tr>
))}
</tbody>
</table>
</div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-slate-600">
                    Halaman {currentPage} dari {Math.max(totalPages, 1)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {currentPage > 1 ? (
                      <Link
                        href={buildPageUrl(currentPage - 1, filters)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Sebelumnya
                      </Link>
                    ) : (
                      <span className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
                        Sebelumnya
                      </span>
                    )}

                    {currentPage < totalPages ? (
                      <Link
                        href={buildPageUrl(currentPage + 1, filters)}
                        className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Berikutnya
                      </Link>
                    ) : (
                      <span className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
                        Berikutnya
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function ProductModelsPage({
  searchParams,
}: ProductModelsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Product Models...
          </p>
        </main>
      }
    >
      <ProductModelsContent searchParams={searchParams} />
    </Suspense>
  );
}
