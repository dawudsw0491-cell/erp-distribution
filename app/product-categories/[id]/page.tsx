
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { toggleProductCategoryStatus } from "../actions";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    status?: string;
    error?: string;
  }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const messages: Record<string, string> = {
  created: "Kategori berhasil dibuat.",
  updated: "Kategori berhasil diperbarui.",
  activated: "Kategori berhasil diaktifkan.",
  deactivated: "Kategori berhasil dinonaktifkan.",
  status_update_failed: "Gagal mengubah status kategori.",
  status_conflict: "Status kategori telah berubah. Muat ulang halaman.",
};

export default async function ProductCategoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const queryParams = await searchParams;

  if (!UUID_REGEX.test(id)) notFound();

  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/?error=forbidden");

  const { data: category, error } = await auth.supabase
    .from("product_categories")
    .select(`
      id,
      category_code,
      category_name,
      description,
      parent_id,
      is_active,
      created_at,
      updated_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Load category detail failed:", error);
  }

  if (!category) notFound();

  let parentName = "-";

  if (category.parent_id) {
    const { data: parent } = await auth.supabase
      .from("product_categories")
      .select("id, category_name")
      .eq("id", category.parent_id)
      .maybeSingle();

    parentName = parent?.category_name ?? "Kategori induk tidak ditemukan";
  }

  const { data: children, error: childrenError } = await auth.supabase
    .from("product_categories")
    .select("id, category_code, category_name, is_active")
    .eq("parent_id", id)
    .order("category_name", { ascending: true });

  if (childrenError) {
    console.error("Load child categories failed:", childrenError);
  }

  const updateAuth = await getAuthorizationContext("master.update");
  const canUpdate = updateAuth.authorized;

  const successMessage =
    queryParams.created === "1"
      ? messages.created
      : queryParams.updated === "1"
        ? messages.updated
        : queryParams.status
          ? messages[queryParams.status]
          : null;

  const errorMessage = queryParams.error
    ? messages[queryParams.error] ?? "Terjadi kesalahan."
    : null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-categories" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              href="/product-categories"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Kategori Produk
            </Link>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Detail Kategori
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Informasi lengkap kategori produk.
                </p>
              </div>

              {canUpdate && (
                <Link
                  href={`/product-categories/${id}/edit`}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Edit Kategori
                </Link>
              )}
            </div>
          </div>

          {successMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-semibold text-slate-900">
                Informasi Kategori
              </h2>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  category.is_active
                    ? "bg-green-50 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {category.is_active ? "Aktif" : "Nonaktif"}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Kode Kategori
                </dt>
                <dd className="mt-1 font-mono text-sm text-slate-900">
                  {category.category_code}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nama Kategori
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {category.category_name}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Kategori Induk
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {parentName}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {category.is_active ? "Aktif" : "Nonaktif"}
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Deskripsi
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                  {category.description || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dibuat Pada
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {new Date(category.created_at).toLocaleString("id-ID")}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Terakhir Diperbarui
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {new Date(category.updated_at).toLocaleString("id-ID")}
                </dd>
              </div>
            </dl>

            {canUpdate && (
              <div className="mt-7 border-t border-slate-200 pt-5">
                <form action={toggleProductCategoryStatus}>
                  <input type="hidden" name="id" value={category.id} />
                  <button
                    type="submit"
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
                      category.is_active
                        ? "border-red-200 text-red-700 hover:bg-red-50"
                        : "border-green-200 text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {category.is_active
                      ? "Nonaktifkan Kategori"
                      : "Aktifkan Kategori"}
                  </button>
                </form>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <h2 className="font-semibold text-slate-900">
              Subkategori
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Kategori yang berada di bawah kategori ini.
            </p>

            <div className="mt-4 divide-y divide-slate-100">
              {(children ?? []).map((child) => (
                <div
                  key={child.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {child.category_name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {child.category_code}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs ${
                        child.is_active
                          ? "text-green-700"
                          : "text-slate-500"
                      }`}
                    >
                      {child.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                    <Link
                      href={`/product-categories/${child.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Detail
                    </Link>
                  </div>
                </div>
              ))}

              {(!children || children.length === 0) && (
                <p className="py-6 text-center text-sm text-slate-500">
                  Belum ada subkategori.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
