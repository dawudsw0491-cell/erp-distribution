
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { toggleProductModelStatus } from "../actions";

export const instant = false;

type ProductModelDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    status?: string;
    error?: string;
  }>;
};

type ProductRow = {
  id: string;
  sku: string;
  product_name: string;
  product_type: string;
  tracking_type: string;
  unit: string;
  is_active: boolean;
  created_at: string;
};

export default async function ProductModelDetailPage({
  params,
  searchParams,
}: ProductModelDetailPageProps) {
  await connection();

  const [{ id }, query] = await Promise.all([
    params,
    searchParams,
  ]);

  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) redirect("/login");

  if (!auth.profile || !auth.authorized) {
    redirect("/product-models?error=forbidden");
  }

  const { data: model, error: modelError } = await auth.supabase
    .from("product_models")
    .select(`
      id,
      brand_id,
      model_code,
      model_name,
      description,
      is_active,
      created_at,
      updated_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (modelError) {
    console.error("Load Product Model detail failed:", modelError);
    throw new Error("Gagal memuat detail Product Model.");
  }

  if (!model) notFound();

  const [
    brandResult,
    productsResult,
    updatePermissionResult,
  ] = await Promise.all([
    auth.supabase
      .from("brands")
      .select("id, brand_code, brand_name")
      .eq("id", model.brand_id)
      .maybeSingle(),

    auth.supabase
      .from("products")
      .select(`
        id,
        sku,
        product_name,
        product_type,
        tracking_type,
        unit,
        is_active,
        created_at
      `)
      .eq("model_id", model.id)
      .order("product_name", { ascending: true }),

    auth.supabase.rpc("has_permission", {
      required_permission: "master.update",
    }),
  ]);

  if (productsResult.error) {
    console.error(
      "Load Product Model products failed:",
      productsResult.error
    );
    throw new Error("Gagal memuat daftar produk.");
  }

  const brand = brandResult.data;
  const products = (productsResult.data ?? []) as ProductRow[];
  const canUpdate = updatePermissionResult.data === true;

  const successMessage =
    query.success === "updated"
      ? "Product Model berhasil diperbarui."
      : undefined;

  const statusMessage =
    query.status === "activated"
      ? "Product Model berhasil diaktifkan."
      : query.status === "deactivated"
        ? "Product Model berhasil dinonaktifkan."
        : undefined;

  const errorMessages: Record<string, string> = {
    status_update_failed: "Gagal memperbarui status Product Model.",
    status_conflict: "Status berubah oleh pengguna lain. Silakan muat ulang.",
    forbidden: "Anda tidak memiliki izin untuk mengubah data.",
  };

  const errorMessage = query.error
    ? errorMessages[query.error] ?? "Terjadi kesalahan."
    : undefined;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-models" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <Link
              href="/product-models"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Product Models
            </Link>

            <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Detail Product Model
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Informasi model produk dalam Master Data HEXACore.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {canUpdate && (
                  <>
                    <Link
                      href={`/product-models/${model.id}/edit`}
                      className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Edit Model
                    </Link>

                    <form action={toggleProductModelStatus}>
                      <input
                        type="hidden"
                        name="id"
                        value={model.id}
                      />

                      <button
                        type="submit"
                        className={
                          model.is_active
                            ? "rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                            : "rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        }
                      >
                        {model.is_active
                          ? "Nonaktifkan Model"
                          : "Aktifkan Model"}
                      </button>
                    </form>
                  </>
                )}

                <Link
                  href="/product-models"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Daftar Model
                </Link>
              </div>
            </div>
          </header>

          {successMessage && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {successMessage}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Informasi Model
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Identitas dan informasi utama Product Model.
                </p>
              </div>

              {model.is_active ? (
                <span className="inline-flex w-fit rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  Aktif
                </span>
              ) : (
                <span className="inline-flex w-fit rounded-md bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700">
                  Nonaktif
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Brand
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {brand?.brand_name ?? "Brand tidak ditemukan"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {brand?.brand_code ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Model Code
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {model.model_code}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Model Name
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {model.model_name}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Jumlah Produk
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-700">
                  {products.length}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dibuat
                </p>
                <p className="mt-2 text-sm text-slate-800">
                  {new Date(model.created_at).toLocaleString("id-ID")}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Terakhir Diperbarui
                </p>
                <p className="mt-2 text-sm text-slate-800">
                  {new Date(model.updated_at).toLocaleString("id-ID")}
                </p>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-200 pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Description
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {model.description || "Tidak ada deskripsi."}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">
                Produk yang Menggunakan Model Ini
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Daftar produk yang terhubung dengan Product Model ini.
              </p>
            </div>

            {products.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="font-semibold text-slate-800">
                  Belum Ada Produk
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Belum ada Product Master yang menggunakan model ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold">
                        SKU
                      </th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold">
                        Nama Produk
                      </th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold">
                        Tipe
                      </th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold">
                        Tracking
                      </th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-blue-700">
                          {product.sku}
                        </td>

                        <td className="px-5 py-4 font-medium text-slate-900">
                          {product.product_name}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {product.product_type}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {product.tracking_type}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          {product.is_active ? (
                            <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Aktif
                            </span>
                          ) : (
                            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Nonaktif
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
