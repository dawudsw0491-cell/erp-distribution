
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const instant = false;

type PageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
    error?: string | string[];
  }>;
};

const PAGE_SIZE = 10;

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductCategoriesPage({
  searchParams,
}: PageProps) {
  await connection();

  const params = await searchParams;
  const keyword = (first(params.q) ?? "").trim();
  const status = first(params.status) ?? "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(first(params.page) ?? "1", 10) || 1
  );

  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/?error=forbidden");
  }

  let query = auth.supabase
    .from("product_categories")
    .select(`
      id,
      category_code,
      category_name,
      description,
      parent_id,
      is_active,
      created_at
    `, { count: "exact" });

  if (keyword) {
    const safeKeyword = keyword.replace(/[\\%_]/g, "\\$&");
    query = query.or(
      `category_code.ilike.%${safeKeyword}%,category_name.ilike.%${safeKeyword}%`
    );
  }

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data: allCategories, error: loadError } = await auth.supabase
    .from("product_categories")
    .select("id, category_name");

  if (loadError) {
    console.error("Load category references failed:", loadError);
  }

  const [
    { count: totalCount, error: totalError },
    { count: activeCount, error: activeError },
    { count: inactiveCount, error: inactiveError },
  ] = await Promise.all([
    auth.supabase
      .from("product_categories")
      .select("*", { count: "exact", head: true }),
    auth.supabase
      .from("product_categories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    auth.supabase
      .from("product_categories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", false),
  ]);

  if (totalError || activeError || inactiveError) {
    console.error("Load category statistics failed:", {
      totalError,
      activeError,
      inactiveError,
    });
  }

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const from = (currentPage - 1) * PAGE_SIZE;

  const { data: categories, count, error } = await query
    .order("category_name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error("Load product categories failed:", error);
  }

  const parentMap = new Map(
    (allCategories ?? []).map((item) => [item.id, item.category_name])
  );

  const canCreate = await getAuthorizationContext("master.create");

  const queryString = (page: number) => {
    const search = new URLSearchParams();
    if (keyword) search.set("q", keyword);
    if (status !== "all") search.set("status", status);
    search.set("page", String(page));
    return `/product-categories?${search.toString()}`;
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-categories" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Kategori Produk
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Kelola kategori utama dan subkategori produk.
              </p>
            </div>

            {canCreate.authorized && (
              <Link
                href="/product-categories/new"
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Tambah Kategori
              </Link>
            )}
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Total Kategori", value: totalCount ?? 0 },
              { label: "Kategori Aktif", value: activeCount ?? 0 },
              { label: "Kategori Nonaktif", value: inactiveCount ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {item.value}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <form
              action="/product-categories"
              method="GET"
              className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_auto]"
            >
              <input
                name="q"
                defaultValue={keyword}
                placeholder="Cari kode atau nama kategori..."
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />

              <select
                name="status"
                defaultValue={status}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>

              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cari
              </button>
            </form>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                Gagal memuat kategori produk.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-4 py-3 font-semibold">No.</th>
                    <th className="px-4 py-3 font-semibold">Kode</th>
                    <th className="px-4 py-3 font-semibold">Nama Kategori</th>
                    <th className="px-4 py-3 font-semibold">Kategori Induk</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(categories ?? []).map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-slate-500">
                        {from + index + 1}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {item.category_code}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.category_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.parent_id
                          ? parentMap.get(item.parent_id) ?? "-"
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.is_active
                              ? "bg-green-50 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/product-categories/${item.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {(!categories || categories.length === 0) && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        Tidak ada kategori yang ditemukan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Menampilkan {categories?.length ?? 0} dari {count ?? 0} kategori
                {" "}· Halaman {currentPage} dari {totalPages}
              </p>

              <div className="flex gap-2">
                <Link
                  href={queryString(Math.max(1, currentPage - 1))}
                  aria-disabled={currentPage <= 1}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    currentPage <= 1
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Sebelumnya
                </Link>
                <Link
                  href={queryString(Math.min(totalPages, currentPage + 1))}
                  aria-disabled={currentPage >= totalPages}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    currentPage >= totalPages
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Berikutnya
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
