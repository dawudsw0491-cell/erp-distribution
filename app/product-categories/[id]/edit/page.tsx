
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import CategoryForm from "../../category-form";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  required: "Nama kategori wajib diisi.",
  invalid_length: "Panjang nama atau deskripsi melebihi batas.",
  invalid_parent: "Kategori induk tidak valid atau dapat membentuk siklus.",
  duplicate: "Nama kategori sudah digunakan.",
  lookup_failed: "Gagal memeriksa data kategori.",
  save_failed: "Perubahan kategori gagal disimpan.",
};

export default async function EditProductCategoryPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const queryParams = await searchParams;

  if (!UUID_REGEX.test(id)) notFound();

  const errorCode = Array.isArray(queryParams.error)
    ? queryParams.error[0]
    : queryParams.error;

  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/product-categories?error=forbidden");

  const { data: category, error: categoryError } = await auth.supabase
    .from("product_categories")
    .select(`
      id,
      category_code,
      category_name,
      description,
      parent_id,
      is_active
    `)
    .eq("id", id)
    .maybeSingle();

  if (categoryError) {
    console.error("Load category for edit failed:", categoryError);
  }

  if (!category) notFound();

  const { data: categories, error: categoriesError } = await auth.supabase
    .from("product_categories")
    .select("id, category_name")
    .eq("is_active", true)
    .order("category_name", { ascending: true });

  if (categoriesError) {
    console.error("Load category options failed:", categoriesError);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-categories" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              href={`/product-categories/${id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Detail Kategori
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Edit Kategori Produk
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Perbarui informasi kategori produk.
            </p>
          </div>

          {!category.is_active && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Kategori ini sedang nonaktif. Perubahan informasi tetap dapat
              dilakukan.
            </div>
          )}

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
              mode="edit"
              categories={categories ?? []}
              category={category}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
