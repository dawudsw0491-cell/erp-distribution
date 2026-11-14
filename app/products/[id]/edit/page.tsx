
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import EditProductForm from "./edit-product-form";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  required: "Nama produk dan satuan wajib diisi.",
  invalid_length: "Panjang karakter melebihi batas.",
  invalid_barcode: "Barcode tidak memenuhi ketentuan.",
  invalid_type: "Jenis produk tidak valid.",
  invalid_tracking: "Metode tracking tidak valid.",
  invalid_stock: "Minimum stock tidak boleh negatif.",
  invalid_reference: "Referensi kategori atau brand tidak valid.",
  invalid_category: "Kategori tidak ditemukan atau tidak aktif.",
  invalid_brand: "Brand tidak ditemukan atau tidak aktif.",
  invalid_condition: "Kondisi produk tidak valid.",
  condition_required: "Kondisi produk wajib dipilih untuk produk barang baru.",
  invalid_subcategory:
    "Subkategori tidak valid atau tidak sesuai dengan kategori utama.",
  duplicate: "Barcode sudah digunakan produk lain.",
  save_failed: "Perubahan produk gagal disimpan.",
  load_failed: "Gagal memuat data produk.",
};

type EditProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function EditProductPage({
  params,
  searchParams,
}: EditProductPageProps) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const errorCode = Array.isArray(query.error)
    ? query.error[0]
    : query.error;

  const errorMessage = errorCode
    ? errorMessages[errorCode]
    : undefined;

  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect(`/products/${id}?error=forbidden`);
  }

  const { data: product, error: productError } =
    await auth.supabase
      .from("products")
      .select(`
        id,
        sku,
        barcode,
        product_name,
        category_id,
        product_subcategory_id,
        product_condition,
        brand_id,
        product_type,
        tracking_type,
        unit,
        minimum_stock,
        description
      `)
      .eq("id", id)
      .maybeSingle();

  if (productError) {
    console.error("Load product for edit failed:", productError);
    redirect(`/products/${id}/edit?error=load_failed`);
  }

  if (!product) {
    notFound();
  }

  const [
    { data: categories, error: categoryError },
    { data: brands, error: brandError },
  ] = await Promise.all([
    auth.supabase
      .from("product_categories")
      .select("id, category_name, parent_id, is_active")
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
    <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/products" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 md:h-screen md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              href={`/products/${id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Detail Produk
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Edit Produk
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Perbarui informasi master produk.
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
            <EditProductForm
              product={product}
              categories={categories ?? []}
              brands={brands ?? []}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
