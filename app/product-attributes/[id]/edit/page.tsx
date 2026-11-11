
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductAttributeEditForm from "./edit-form";

export const metadata = {
  title: "Edit Product Attribute | DAWUD ERP",
  description: "Ubah master atribut produk",
};

export const instant = false;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductAttributePage({
  params,
}: PageProps) {
  await connection();

  const { id } = await params;

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
              Anda tidak memiliki permission melihat Product Attributes.
            </p>
            <Link href="/" className="mt-5 inline-block text-blue-700">
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { authorized: canUpdate } =
    await getAuthorizationContext("master.update");

  if (!canUpdate) {
    redirect(`/product-attributes/${id}`);
  }

  const { data: attribute, error } = await supabase
    .from("product_attributes")
    .select(
      "id, attribute_code, attribute_name, description, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Product attribute edit fetch:", error);

    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/product-attributes" />
        <main className="flex-1 bg-slate-100 p-8">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Atribut
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil data atribut.
            </p>
            <Link
              href="/product-attributes"
              className="mt-4 inline-block text-sm text-blue-700"
            >
              Kembali ke Daftar Atribut
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!attribute) notFound();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-attributes" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <header>
            <Link
              href={`/product-attributes/${attribute.id}`}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ← Kembali ke Detail Atribut
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Edit Product Attribute
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              Ubah informasi master atribut produk.
            </p>
          </header>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <ProductAttributeEditForm attribute={attribute} />
          </section>
        </div>
      </main>
    </div>
  );
}
