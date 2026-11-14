
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ProductFilters from "./product-filters";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Daftar Produk | DAWUD ERP",
  description: "Master data produk ERP Distribution",
};

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 10;

function buildPageUrl(
  page: number,
  filters: {
    q: string;
    status: string;
  }
) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
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
    statisticsResult,
  ] = await Promise.all([
    searchParams,

    supabase.rpc("has_permission", {
      required_permission: "master.create",
    }),

    supabase.rpc("get_product_statistics"),
  ]);

  const canCreate = createPermissionResult.data === true;

  // Parameter pencarian dan status.
  const keyword = (params.q ?? "").trim().slice(0, 100);

  // Pencarian hanya dijalankan jika minimal 3 karakter.
  const searchKeyword =
    keyword.length >= 3 ? keyword : "";

  const status =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "";

  const requestedPage = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  // Hilangkan karakter khusus yang dapat mengganggu filter PostgREST.
  const safeKeyword = searchKeyword.replace(/[,%()]/g, "").trim();

  if (statisticsResult.error) {
    console.error(
      "Load product statistics failed:",
      statisticsResult.error
    );

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

  const statistics = statisticsResult.data?.[0];

  const totalProducts = Number(
    statistics?.total_products ?? 0
  );

  const activeProducts = Number(
    statistics?.active_products ?? 0
  );

  const inactiveProducts = Number(
    statistics?.inactive_products ?? 0
  );

  // Cari ID kategori dan brand berdasarkan kata kunci.
  let categoryIds: string[] = [];
  let brandIds: string[] = [];

  if (safeKeyword) {
    const pattern = `%${safeKeyword}%`;

    const [
      categoryResult,
      brandResult,
    ] = await Promise.all([
      supabase
        .from("product_categories")
        .select("id")
        .ilike("category_name", pattern)
        .limit(500),

      supabase
        .from("brands")
        .select("id")
        .ilike("brand_name", pattern)
        .limit(500),
    ]);

    if (categoryResult.error || brandResult.error) {
      console.error("Product search lookup failed:", {
        categoryError: categoryResult.error,
        brandError: brandResult.error,
      });

      return (
        <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
          <ErpSidebar activePath="/products" />

          <main className="min-w-0 flex-1 bg-slate-100 p-6">
            <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
              <h1 className="text-lg font-bold text-red-700">
                Gagal Menjalankan Pencarian
              </h1>

              <p className="mt-2 text-sm text-slate-600">
                Terjadi kesalahan saat mencari kategori atau brand.
                Silakan coba kembali.
              </p>
            </div>
          </main>
        </div>
      );
    }

    categoryIds = (categoryResult.data ?? []).map(
      (item) => item.id
    );

    brandIds = (brandResult.data ?? []).map(
      (item) => item.id
    );
  }

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

  // Pencarian universal:
  // SKU, barcode, nama, kategori, brand, jenis, dan tracking.
  if (safeKeyword) {
    const pattern = `%${safeKeyword}%`;

    const searchConditions = [
      `sku.ilike.${pattern}`,
      `barcode.ilike.${pattern}`,
      `product_name.ilike.${pattern}`,
    ];

    if (categoryIds.length > 0) {
      searchConditions.push(
        `category_id.in.(${categoryIds.join(",")})`
      );
    }

    if (brandIds.length > 0) {
      searchConditions.push(
        `brand_id.in.(${brandIds.join(",")})`
      );
    }

    const normalizedSearch = safeKeyword.toLowerCase();

    const matchesAlias = (aliases: string[]) =>
      aliases.some(
        (alias) =>
          alias.includes(normalizedSearch) ||
          normalizedSearch.includes(alias)
      );

    // Jenis produk.
    if (matchesAlias(["barang", "goods"])) {
      searchConditions.push("product_type.eq.goods");
    }

    if (matchesAlias(["jasa", "service"])) {
      searchConditions.push("product_type.eq.service");
    }

    // Tracking produk.
    if (matchesAlias(["kuantitas", "quantity"])) {
      searchConditions.push("tracking_type.eq.quantity");
    }

    if (matchesAlias(["imei"])) {
      searchConditions.push("tracking_type.eq.imei");
    }

    if (matchesAlias(["serial", "serial number"])) {
      searchConditions.push("tracking_type.eq.serial");
    }

    productQuery = productQuery.or(
      searchConditions.join(",")
    );
  }

  // Filter status tetap terpisah dari pencarian universal.
  if (status === "active") {
    productQuery = productQuery.eq("is_active", true);
  }

  if (status === "inactive") {
    productQuery = productQuery.eq("is_active", false);
  }

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
    console.error("Load products failed:", error);

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

            <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-5 shadow-sm">
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

          <ProductFilters
            initialKeyword={keyword}
            initialStatus={status}
          />

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
