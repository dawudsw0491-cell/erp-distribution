
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import CategoryForm from "../category-form";

export const instant = false;

const errorMessages: Record<string, string> = {
  required: "Nama kategori wajib diisi.",
  invalid_length: "Panjang nama atau deskripsi melebihi batas.",
  invalid_parent: "Kategori induk tidak valid atau dapat membentuk siklus.",
  duplicate: "Nama kategori sudah digunakan.",
  duplicate_code: "Kode kategori sudah digunakan.",
  lookup_failed: "Gagal memeriksa data kategori.",
  save_failed: "Kategori gagal disimpan.",
  forbidden: "Anda tidak memiliki izin membuat kategori.",
};

type PageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function NewProductCategoryPage({
  searchParams,
}: PageProps) {
  await connection();

  const params = await searchParams;
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;

  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-categories?error=forbidden");
  }

  const { data: categories, error } = await auth.supabase
    .from("product_categories")
    .select("id, category_name")
    .eq("is_active", true)
    .order("category_name", { ascending: true });

  if (error) {
    console.error("Load parent categories failed:", error);
  }

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

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Tambah Kategori Produk
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Masukkan informasi kategori produk baru.
            </p>
          </div>

          {errorCode && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {errorMessages[errorCode] ?? "Terjadi kesalahan."}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <CategoryForm
              mode="create"
              categories={categories ?? []}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
