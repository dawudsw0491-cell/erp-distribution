
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import VariantStatusButton from "./variant-status-button";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{
    id: string;
    variantId: string;
  }>;
};

export default async function ProductVariantDetailPage({ params }: Props) {
  await connection();

  const { id, variantId } = await params;

  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(variantId)) {
    notFound();
  }

  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("master.view");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    return (
      <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-6">
          <h1 className="text-xl font-bold text-red-700">Akses Ditolak</h1>
          <p className="mt-2 text-sm text-slate-600">
            Anda tidak memiliki izin melihat detail varian.
          </p>
          <Link
            href={`/products/${id}/variants`}
            className="mt-4 inline-block text-blue-600"
          >
            Kembali ke Daftar Varian
          </Link>
        </main>
      </div>
    );
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, sku, product_name")
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    console.error("Product fetch error:", productError);
    throw new Error("Gagal mengambil data produk.");
  }

  if (!product) notFound();

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, variant_sku, variant_name, barcode, is_active, created_at, updated_at"
    )
    .eq("id", variantId)
    .eq("product_id", id)
    .maybeSingle();

  if (variantError) {
    console.error("Variant fetch error:", variantError);
    throw new Error("Gagal mengambil data varian.");
  }

  if (!variant) notFound();

  const { data: canUpdate } = await supabase.rpc("has_permission", {
    required_permission: "master.update",
  });

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/products" />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-6">
        <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6">
          <div>
            <Link
              href={`/products/${id}/variants`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Kembali ke Daftar Varian
            </Link>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">
                  Detail Variant
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {product.product_name} · SKU Produk: {product.sku}
                </p>
              </div>

              {canUpdate === true && (
  <div className="flex flex-wrap gap-2">
    <Link
      href={`/products/${id}/variants/${variantId}/edit`}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Edit Variant
    </Link>

    <VariantStatusButton
      productId={id}
      variantId={variantId}
      isActive={variant.is_active}
    />
  </div>
)}
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h2 className="font-semibold text-slate-800">
                Informasi Variant
              </h2>
            </div>

            <div className="grid min-w-0 gap-5 p-4 sm:grid-cols-2 sm:gap-6 sm:p-5">
              <div>
                <p className="text-sm text-slate-500">SKU Variant</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {variant.variant_sku}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Nama Variant</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {variant.variant_name}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Barcode</p>
                <p className="mt-1 font-medium text-slate-800">
                  {variant.barcode || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Status</p>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                    variant.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {variant.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="font-semibold text-slate-800">
              Informasi Sistem
            </h2>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">Dibuat</p>
                <p className="mt-1 text-sm text-slate-700">
                  {new Date(variant.created_at).toLocaleString("id-ID")}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Terakhir Diperbarui</p>
                <p className="mt-1 text-sm text-slate-700">
                  {new Date(variant.updated_at).toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
