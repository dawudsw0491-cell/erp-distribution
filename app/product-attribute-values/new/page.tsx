
import Link from "next/link";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import AttributeValueForm from "../attribute-value-form";

export const metadata = {
  title: "Tambah Attribute Value | ERP HEXACORE",
};

export const instant = false;

export default async function NewProductAttributeValuePage() {
  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("master.create");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        <ErpSidebar activePath="/product-attribute-values" />

        <main className="flex min-w-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk menambahkan
              Attribute Value.
            </p>

            <Link
              href="/product-attribute-values"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { data: attributes, error } = await supabase
    .from("product_attributes")
    .select("id, attribute_code, attribute_name")
    .eq("is_active", true)
    .order("attribute_name", { ascending: true });

  if (error) {
    console.error("Gagal mengambil Product Attributes:", error);

    return (
      <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
        <ErpSidebar activePath="/product-attribute-values" />

        <main className="min-w-0 flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Parent Attribute
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Data atribut tidak dapat diambil. Silakan muat ulang
              halaman atau hubungi administrator.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
      <ErpSidebar activePath="/product-attribute-values" />

      <main className="min-w-0 flex-1 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <div className="mb-4">
              <Link
                href="/product-attribute-values"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"
              >
                <span aria-hidden="true">←</span>
                Kembali ke Attribute Values
              </Link>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Tambah Attribute Value
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Tambahkan nilai standar untuk atribut produk
                HEXACORE ERP.
              </p>
            </div>
          </header>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-6 border-b border-slate-200 pb-4">
              <h2 className="font-semibold text-slate-900">
                Informasi Attribute Value
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Tentukan Parent Attribute dan nilai yang akan
                digunakan oleh produk.
              </p>
            </div>

            <div className="max-w-3xl">
              <AttributeValueForm attributes={attributes ?? []} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
