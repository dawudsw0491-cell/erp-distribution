
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { toggleProductAttributeStatus } from "../actions";

export const metadata = {
  title: "Detail Product Attribute | DAWUD ERP",
  description: "Detail master atribut produk",
};

export const instant = false;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    success?: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default async function ProductAttributeDetailPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

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

  const [attributeResult, updatePermission] = await Promise.all([
    supabase
      .from("product_attributes")
      .select(
        "id, attribute_code, attribute_name, description, is_active, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle(),

    supabase.rpc("has_permission", {
      required_permission: "master.update",
    }),
  ]);

  if (attributeResult.error) {
    console.error("Product attribute detail:", attributeResult.error);

    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-attributes" />
        <main className="flex-1 bg-slate-100 p-8">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Detail Atribut
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil data dari database.
            </p>
            <Link
              href="/product-attributes"
              className="mt-4 inline-block text-sm font-semibold text-blue-700"
            >
              Kembali ke Daftar Atribut
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const attribute = attributeResult.data;

  if (!attribute) notFound();

  const canUpdate = updatePermission.data === true;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-attributes" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">

          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <Link
                href="/product-attributes"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                ← Kembali ke Product Attributes
              </Link>

              <h1 className="mt-3 text-2xl font-bold text-slate-900">
                Detail Product Attribute
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Informasi master atribut dan spesifikasi produk.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canUpdate && (
                <>
                  <Link
                    href={`/product-attributes/${attribute.id}/edit`}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Edit Atribut
                  </Link>

                  <form action={toggleProductAttributeStatus}>
                    <input
                      type="hidden"
                      name="id"
                      value={attribute.id}
                    />
                    <input
                      type="hidden"
                      name="current_status"
                      value={String(attribute.is_active)}
                    />

                    <button
                      type="submit"
                      className={
                        attribute.is_active
                          ? "rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                          : "rounded-lg border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                      }
                    >
                      {attribute.is_active
                        ? "Nonaktifkan"
                        : "Aktifkan"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </header>

          {query.success === "updated" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              Perubahan atribut berhasil disimpan.
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Informasi Atribut
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Data utama master Product Attribute.
                </p>
              </div>

              {attribute.is_active ? (
                <span className="w-fit rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Aktif
                </span>
              ) : (
                <span className="w-fit rounded-md bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                  Nonaktif
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Kode Atribut
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {attribute.attribute_code}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">
                  Nama Atribut
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {attribute.attribute_name}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-sm font-medium text-slate-500">
                  Deskripsi
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                  {attribute.description || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">
                  Dibuat Pada
                </p>
                <p className="mt-2 text-sm text-slate-800">
                  {formatDate(attribute.created_at)}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">
                  Terakhir Diperbarui
                </p>
                <p className="mt-2 text-sm text-slate-800">
                  {formatDate(attribute.updated_at)}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-xs text-slate-400">
                  ID: {attribute.id}
                </p>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
