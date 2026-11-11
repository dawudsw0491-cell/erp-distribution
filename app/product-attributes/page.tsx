
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = {
  title: "Product Attributes | DAWUD ERP",
  description: "Master atribut dan spesifikasi produk",
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

async function AttributesContent({ searchParams }: PageProps) {
  await connection();

  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("master.view");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-attributes" />
        <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md rounded-xl border bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-red-700">
              Akses Ditolak
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat Product Attributes.
            </p>
            <Link href="/" className="mt-5 inline-block text-blue-700">
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const keyword = (params.q ?? "").trim().slice(0, 100);
  const status = ["active", "inactive"].includes(params.status ?? "")
    ? params.status!
    : "";

  const [createPermission, totalResult, activeResult, inactiveResult] =
    await Promise.all([
      supabase.rpc("has_permission", {
        required_permission: "master.create",
      }),
      supabase
        .from("product_attributes")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("product_attributes")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("product_attributes")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false),
    ]);

  let query = supabase
    .from("product_attributes")
    .select(
      "id, attribute_code, attribute_name, description, is_active, created_at",
      { count: "exact" }
    )
    .order("attribute_name", { ascending: true });

  const safeKeyword = keyword.replace(/[,%()]/g, "").trim();

  if (safeKeyword) {
    query = query.or(
      `attribute_code.ilike.%${safeKeyword}%,attribute_name.ilike.%${safeKeyword}%`
    );
  }

  if (status === "active") {
    query = query.eq("is_active", true);
  }

  if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data: attributes, error, count } = await query;

  const canCreate = createPermission.data === true;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-attributes" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Product Attributes
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pengelolaan atribut dan spesifikasi standar produk.
              </p>
            </div>

            {canCreate && (
              <Link
                href="/product-attributes/new"
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Tambah Atribut
              </Link>
            )}
          </header>

          {totalResult.error || activeResult.error || inactiveResult.error ? (
            <div className="rounded-xl border border-red-200 bg-white p-6">
              <h2 className="font-bold text-red-700">
                Gagal Memuat Statistik Atribut
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Periksa koneksi database atau konfigurasi permission.
              </p>
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-300 bg-white p-5">
                <p className="text-sm font-semibold text-slate-600">
                  Total Atribut
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {totalResult.count ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-slate-600">
                  Atribut Aktif
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {activeResult.count ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-red-300 bg-red-50 p-5">
                <p className="text-sm font-semibold text-slate-600">
                  Atribut Nonaktif
                </p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {inactiveResult.count ?? 0}
                </p>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Pencarian dan Filter
            </h2>

            <form
              action="/product-attributes"
              method="GET"
              className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              <div className="md:col-span-2">
                <label
                  htmlFor="attribute-search"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Kode atau Nama Atribut
                </label>
                <input
                  id="attribute-search"
                  name="q"
                  type="search"
                  defaultValue={keyword}
                  maxLength={100}
                  placeholder="Contoh: COLOR, CAPACITY, RAM..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="attribute-status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="attribute-status"
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>

              <div className="flex gap-2 md:col-span-3">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Terapkan Filter
                </button>
                <Link
                  href="/product-attributes"
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Daftar Atribut
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Total data ditemukan: {count ?? 0}
              </p>
            </div>

            {error ? (
              <div className="p-6 text-sm text-red-700">
                Gagal mengambil data atribut dari database.
              </div>
            ) : !attributes || attributes.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="font-semibold text-slate-800">
                  Belum ada data atribut
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Tambahkan atribut seperti warna, kapasitas, RAM, atau ukuran.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-5 py-4 text-left">Kode Atribut</th>
                      <th className="px-5 py-4 text-left">Nama Atribut</th>
                      <th className="px-5 py-4 text-left">Deskripsi</th>
                      <th className="px-5 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attributes.map((attribute) => (
                      <tr key={attribute.id} className="hover:bg-blue-50/40">
                        <td className="px-5 py-4 font-semibold">
                          <Link
                            href={`/product-attributes/${attribute.id}`}
                            className="text-blue-700 hover:underline"
                          >
                            {attribute.attribute_code}
                          </Link>
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-900">
                          {attribute.attribute_name}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {attribute.description || "-"}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {attribute.is_active ? (
                            <span className="rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              Aktif
                            </span>
                          ) : (
                            <span className="rounded-md bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
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

export default function ProductAttributesPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">
            Memuat Product Attributes...
          </p>
        </main>
      }
    >
      <AttributesContent searchParams={props.searchParams} />
    </Suspense>
  );
}
