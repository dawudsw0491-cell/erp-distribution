
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductForm from "./product-form";

export const instant = false;

const errorMessages: Record<string, string> = {
  required: "SKU, nama produk, dan satuan wajib diisi.",
  invalid_length: "Panjang karakter salah satu field melebihi batas.",
  invalid_barcode: "Barcode tidak memenuhi ketentuan.",
  invalid_type: "Jenis produk tidak valid.",
  invalid_tracking: "Metode tracking tidak valid.",
  invalid_stock: "Minimum stock harus berupa angka dan tidak boleh negatif.",
  invalid_reference: "Referensi kategori atau brand tidak valid.",
  invalid_category: "Kategori tidak ditemukan atau sudah tidak aktif.",
  invalid_brand: "Brand tidak ditemukan atau sudah tidak aktif.",
  invalid_condition: "Kondisi produk tidak valid.",
  condition_required: "Kondisi produk wajib dipilih untuk produk barang.",
  invalid_subcategory: "Subkategori tidak valid atau tidak sesuai dengan kategori utama.",
  duplicate: "SKU atau barcode sudah digunakan oleh produk lain.",
  save_failed: "Produk gagal disimpan. Silakan coba kembali.",
};

type NewProductPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function NewProductPage({
  searchParams,
}: NewProductPageProps) {
  await connection();

  const params = await searchParams;
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;

  const errorMessage = errorCode
    ? errorMessages[errorCode]
    : undefined;

  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect("/products?error=forbidden");
  }

  const [
    { data: categories, error: categoryError },
    { data: brands, error: brandError },
  ] = await Promise.all([
    auth.supabase
      .from("product_categories")
      .select("id, category_name, parent_id")
      .eq("is_active", true)
      .order("category_name", { ascending: true }),

    auth.supabase
      .from("brands")
      .select("id, brand_name")
      .eq("is_active", true)
      .order("brand_name", { ascending: true }),
  ]);

  if (categoryError) {
    console.error("Load product categories failed:", categoryError);
  }

  if (brandError) {
    console.error("Load brands failed:", brandError);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/products" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              href="/products"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Products
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Tambah Produk
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Masukkan informasi master produk ke dalam sistem ERP.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <ProductForm
              categories={categories ?? []}
              brands={brands ?? []}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
