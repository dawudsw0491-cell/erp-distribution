
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createProductVariant } from "@/app/products/actions";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  required: "SKU dan nama varian wajib diisi.",
  invalid_sku: "Format atau panjang SKU varian tidak valid.",
  invalid_sku_format: "SKU hanya boleh menggunakan huruf, angka, titik, garis bawah, dan tanda hubung.",
  invalid_name: "Nama varian melebihi batas 200 karakter.",
  invalid_barcode: "Barcode melebihi batas 100 karakter.",
  inactive_product: "Produk sudah nonaktif. Varian tidak dapat ditambahkan.",
  invalid_product_type: "Varian hanya dapat ditambahkan pada produk barang (goods).",
  duplicate_sku: "SKU sudah digunakan oleh produk atau varian lain.",
  duplicate: "SKU atau barcode sudah terdaftar.",
  invalid_reference: "Referensi produk tidak valid.",
  lookup_failed: "Gagal memeriksa duplikasi SKU. Silakan coba kembali.",
  save_failed: "Varian gagal disimpan. Silakan coba kembali.",
};

export default async function NewProductVariantPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const { error: errorCode } = await searchParams;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const auth = await getAuthorizationContext("master.create");

 console.log("[VARIANT NEW] AUTH:", {
  userId: auth.user?.id ?? null,
  authorized: auth.authorized,
  hasSupabase: !!auth.supabase,
}); 
  
  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect(`/products/${id}/variants?error=forbidden`);
  }

  const { data: product, error } = await auth.supabase
    .from("products")
    .select("id, sku, product_name, product_type, is_active")
    .eq("id", id)
    .maybeSingle();

console.log("[VARIANT NEW] PRODUCT:", {
  productId: id,
  found: !!product,
  error: error?.message ?? null,
  productType: product?.product_type ?? null,
  isActive: product?.is_active ?? null,
});

  if (error || !product) {
    notFound();
  }

  if (!product.is_active || product.product_type !== "goods") {
    redirect(`/products/${id}/variants`);
  }
    return (
  <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
    <ErpSidebar activePath="/products" />

    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6">
          <div>
            <Link
              href={`/products/${id}/variants`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke daftar varian
            </Link>

            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              Tambah Varian Produk
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Tambahkan varian untuk produk berikut.
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Produk Utama
            </p>
            <p className="mt-2 font-semibold text-slate-900">
              {product.product_name}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              SKU: {product.sku}
            </p>
          </div>

          {errorCode && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessages[errorCode] ?? "Terjadi kesalahan. Silakan periksa kembali data Anda."}
            </div>
          )}

          <form
            action={createProductVariant}
            className="w-full min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
          >
            <input type="hidden" name="product_id" value={product.id} />

            <div>
              <label
                htmlFor="variant_sku"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                SKU Varian <span className="text-red-500">*</span>
              </label>
              <input
                id="variant_sku"
                name="variant_sku"
                type="text"
                required
                maxLength={50}
                placeholder="Contoh: PROD001-BLK"
                className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">
                Maksimal 50 karakter. Gunakan huruf kapital, angka, titik,
                garis bawah, atau tanda hubung.
              </p>
            </div>

            <div>
              <label
                htmlFor="variant_name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Nama Varian <span className="text-red-500">*</span>
              </label>
              <input
                id="variant_name"
                name="variant_name"
                type="text"
                required
                maxLength={200}
                placeholder="Contoh: Hitam - Ukuran XL"
                className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="barcode"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Barcode
              </label>
              <input
                id="barcode"
                name="barcode"
                type="text"
                maxLength={100}
                placeholder="Masukkan barcode jika tersedia"
                className="box-border w-full min-w-0 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">
                Opsional. Barcode harus unik.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <Link
                href={`/products/${id}/variants`}
                className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </Link>

              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Simpan Varian
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
