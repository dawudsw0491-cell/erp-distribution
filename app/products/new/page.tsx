
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductForm from "./product-form";

export const instant = false;

const errorMessages: Record<string, string> = {
  required: "Nama produk dan satuan wajib diisi.",
  invalid_length: "Panjang karakter salah satu field melebihi batas.",
  invalid_barcode: "Barcode tidak memenuhi ketentuan.",
  invalid_type: "Jenis produk tidak valid.",
  invalid_tracking: "Metode tracking tidak valid.",
  invalid_stock: "Minimum stock harus berupa angka dan tidak boleh negatif.",
  invalid_reference: "Referensi kategori atau brand tidak valid.",
  invalid_category: "Kategori tidak ditemukan atau sudah tidak aktif.",
  invalid_brand: "Brand tidak ditemukan atau sudah tidak aktif.",
  invalid_model: "Product Model tidak ditemukan, tidak aktif, atau tidak sesuai dengan Brand.",
  invalid_condition: "Kondisi produk tidak valid.",
  condition_required: "Kondisi produk wajib dipilih untuk produk barang.",
  invalid_subcategory: "Subkategori tidak valid atau tidak sesuai dengan kategori utama.",
  duplicate: "SKU atau barcode sudah digunakan oleh produk lain.",
  invalid_variants: "Periksa nama varian, barcode, dan panjang spesifikasi. Nama varian dalam satu produk tidak boleh duplikat.",
  variant_required: "Produk barang wajib memiliki minimal satu varian dan maksimal 100 varian per penyimpanan.",
  service_variants: "Produk jasa tidak menggunakan varian persediaan.",
  forbidden: "Anda tidak memiliki izin membuat produk dan varian.",
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
    { data: models, error: modelError },
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

    auth.supabase
      .from("product_models")
      .select("id, brand_id, model_name, model_code")
      .eq("is_active", true)
      .order("model_name", { ascending: true }),
  ]);

  if (categoryError) {
    console.error("Load product categories failed:", categoryError);
  }

  if (brandError) {
    console.error("Load brands failed:", brandError);
  }

  if (modelError) {
    console.error("Load product models failed:", modelError);
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
              Kelola identitas produk, kategori, seluruh SKU varian, spesifikasi, dan garansi dalam satu proses.
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
              models={models ?? []}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
