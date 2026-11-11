
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Daftar Produk | DAWUD ERP",
  description: "Master data produk ERP Distribution",
};

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    tracking?: string;
    status?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 10;

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    type: string;
    tracking: string;
    status: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.tracking) params.set("tracking", filters.tracking);
  if (filters.status) params.set("status", filters.status);

  params.set("page", String(page));

  return `/products?${params.toString()}`;
}

function getProductTypeLabel(type: string) {
  return type === "service" ? "Jasa" : "Barang";
}

function getTrackingLabel(tracking: string) {
  const labels: Record<string, string> = {
    quantity: "Kuantitas",
    imei: "IMEI",
    serial: "Serial Number",
  };

  return labels[tracking] ?? tracking;
}

async function ProductsContent({
  searchParams,
}: ProductsPageProps) {
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
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat master data
              produk. Silakan hubungi administrator sistem.
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
    totalResult,
    activeResult,
    inactiveResult,
  ] = await Promise.all([
    searchParams,

    supabase.rpc("has_permission", {
      required_permission: "master.create",
    }),

    supabase
      .from("products")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false),
  ]);

  const canCreate = createPermissionResult.data === true;

  const keyword = (params.q ?? "").trim().slice(0, 100);

  const productType = ["goods", "service"].includes(params.type ?? "")
    ? params.type!
    : "";

  const tracking = ["quantity", "imei", "serial"].includes(
    params.tracking ?? ""
  )
    ? params.tracking!
    : "";

  const status = ["active", "inactive"].includes(params.status ?? "")
    ? params.status!
    : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const safeKeyword = keyword.replace(/[,%()]/g, "").trim();

  let productQuery = supabase
    .from("products")
    .select(
      `
        id,
        sku,
        barcode,
        product_name,
        product_type,
        tracking_type,
        unit,
        minimum_stock,
        is_active,
        created_at,
        category:product_categories(category_name),
        brand:brands(brand_name)
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (safeKeyword) {
    const pattern = `%${safeKeyword}%`;

    productQuery = productQuery.or(
      [
        `sku.ilike.${pattern}`,
        `barcode.ilike.${pattern}`,
        `product_name.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (productType) {
    productQuery = productQuery.eq("product_type", productType);
  }

  if (tracking) {
    productQuery = productQuery.eq("tracking_type", tracking);
  }

  if (status === "active") {
    productQuery = productQuery.eq("is_active", true);
  }

  if (status === "inactive") {
    productQuery = productQuery.eq("is_active", false);
  }

  if (
    totalResult.error ||
    activeResult.error ||
    inactiveResult.error
  ) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Ringkasan Produk
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil statistik produk.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const totalProducts = totalResult.count ?? 0;
  const activeProducts = activeResult.count ?? 0;
  const inactiveProducts = inactiveResult.count ?? 0;

  const offset = (requestedPage - 1) * PAGE_SIZE;

  const {
    data: products,
    error,
    count,
  } = await productQuery.range(
    offset,
    offset + PAGE_SIZE - 1
  );

  if (error) {
    return (
      <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />

        <main className="min-w-0 flex-1 bg-slate-100 p-6">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold text-red-700">
              Gagal Memuat Data Produk
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Data produk tidak dapat diambil dari database.
              Silakan periksa koneksi atau hubungi administrator.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const filteredTotal = count ?? 0;
  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE);

  const currentPage = Math.min(
    requestedPage,
    Math.max(totalPages, 1)
  );

  const filters = {
    q: keyword,
    type: productType,
    tracking,
    status,
  };

  if (requestedPage !== currentPage) {
    redirect(buildPageUrl(currentPage, filters));
  }

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/products" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Master Data Produk
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Pengelolaan barang dan jasa perusahaan.
              </p>
            </div>

            {canCreate && (
              <Link
                href="/products/new"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                + Tambah Produk
              </Link>
            )}
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-300 bg-slate-100 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Total Produk
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {totalProducts}
              </p>
            </div>

            <div className="rounded-xl border-emerald-400 border bg-emerald-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
  Produk Aktif
</p>

              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {activeProducts}
              </p>
            </div>

            <div className="rounded-xl border border-red-400 bg-red-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Produk Nonaktif
              </p>

              <p className="mt-2 text-2xl font-bold text-red-700">
                {inactiveProducts}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-900">
                Pencarian dan Filter
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Cari berdasarkan SKU, barcode, atau nama produk.
              </p>
            </div>

            <form
              action="/products"
              method="GET"
              className="grid grid-cols-1 gap-4 md:grid-cols-4"
            >
              <div className="md:col-span-2">
                <label
                  htmlFor="product-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kata Kunci
                </label>

                <input
                  id="product-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  placeholder="SKU, barcode, atau nama produk..."
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="product-type"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Jenis Produk
                </label>

                <select
                  id="product-type"
                  name="type"
                  defaultValue={productType}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Jenis</option>
                  <option value="goods">Barang</option>
                  <option value="service">Jasa</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="product-tracking"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Tracking
                </label>

                <select
                  id="product-tracking"
                  name="tracking"
                  defaultValue={tracking}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Tracking</option>
                  <option value="quantity">Kuantitas</option>
                  <option value="imei">IMEI</option>
                  <option value="serial">Serial Number</option>
                </select>
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
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2 md:col-span-4">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>

                <Link
                  href="/products"
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
                  Daftar Produk
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Menampilkan {filteredTotal === 0 ? 0 : offset + 1}
                  {" - "}
                  {Math.min(offset + PAGE_SIZE, filteredTotal)}
                  {" dari "}
                  {filteredTotal} produk.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                Maksimal {PAGE_SIZE} data per halaman
              </span>
            </div>

            {filteredTotal === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="font-semibold text-slate-800">
                  Data produk tidak ditemukan
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Ubah kata kunci atau filter pencarian.
                </p>

                <Link
                  href="/products"
                  className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Tampilkan semua produk
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-sm">
                    <thead className="bg-slate-50 text-slate-900">
                      <tr>
                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          SKU
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Nama Produk
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Kategori
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Brand
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Jenis
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Tracking
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Satuan
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Minimum Stok
                        </th>

                        <th className="whitespace-nowrap px-5 py-4 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {products?.map((product) => (
                        <tr
                          key={product.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-semibold">
  <Link
    href={`/products/${product.id}`}
    className="text-blue-700 hover:text-blue-900 hover:underline"
    title="Lihat detail produk"
  >
    {product.sku}
  </Link>
</td>

                          <td className="px-5 py-4 font-medium text-slate-900">
                            <div>{product.product_name}</div>

                            {product.barcode && (
                              <div className="mt-1 text-xs text-slate-500">
                                Barcode: {product.barcode}
                              </div>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {(product.category as unknown as { category_name: string } | null)?.category_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {(product.brand as unknown as { brand_name: string } | null)?.brand_name ?? "-"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {getProductTypeLabel(product.product_type)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {getTrackingLabel(product.tracking_type)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {product.unit}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                            {Number(product.minimum_stock).toLocaleString("id-ID")}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
  {product.is_active ? (
  <span className="inline-flex items-center rounded-md border border-green-800 bg-green-700 px-3 py-1 text-xs font-semibold text-white">
    Aktif
  </span>
) : (
  <span className="inline-flex items-center rounded-md border border-red-800 bg-red-700 px-3 py-1 text-xs font-semibold text-white">
    Nonaktif
  </span>
)}
</td>
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

export default function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat data produk...
          </p>
        </main>
      }
    >
      <ProductsContent searchParams={searchParams} />
    </Suspense>
  );
}
