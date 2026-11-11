
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import EditVariantForm from "./edit-variant-form";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{
    id: string;
    variantId: string;
  }>;
};

export default async function EditProductVariantPage({
  params,
}: PageProps) {
  await connection();

  const { id, variantId } = await params;

  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(variantId)) {
    notFound();
  }

  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect(`/products/${id}/variants/${variantId}?error=forbidden`);
  }

  const { data: product, error: productError } = await auth.supabase
    .from("products")
    .select("id, sku, product_name, is_active, product_type")
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    console.error("Load product for variant edit failed:", productError);
    throw new Error("Gagal memuat data produk.");
  }

  if (!product) {
    notFound();
  }

  const { data: variant, error: variantError } = await auth.supabase
    .from("product_variants")
    .select(
      "id, product_id, variant_sku, variant_name, barcode, is_active, created_at, updated_at"
    )
    .eq("id", variantId)
    .eq("product_id", id)
    .maybeSingle();

  if (variantError) {
    console.error("Load variant for edit failed:", variantError);
    throw new Error("Gagal memuat data variant.");
  }

  if (!variant) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <ErpSidebar activePath="/products" />

      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <Link
              href={`/products/${id}/variants/${variantId}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Detail Variant
            </Link>

            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              Edit Product Variant
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Perbarui informasi variant untuk produk{" "}
              <span className="font-semibold text-slate-700">
                {product.product_name}
              </span>{" "}
              ({product.sku}).
            </p>
          </div>

          <EditVariantForm
            productId={id}
            variantId={variantId}
            variantSku={variant.variant_sku}
            initialVariantName={variant.variant_name}
            initialBarcode={variant.barcode ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
