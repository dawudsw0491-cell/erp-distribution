
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
  searchParams: Promise<{ error?: string }>;
};

export default async function EditProductVariantPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id, variantId } = await params;
  const { error: errorCode } = await searchParams;

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

  const specificationFields = [
    { code: "RAM", label: "RAM" },
    { code: "ROM", label: "ROM" },
    { code: "COLOR", label: "Warna" },
    { code: "WARRANTY", label: "Warranty" },
  ] as const;

  const { data: specificationAttributes, error: specificationAttributeError } =
    await auth.supabase
      .from("product_attributes")
      .select("id, attribute_code")
      .in("attribute_code", specificationFields.map((field) => field.code))
      .eq("is_active", true);

  if (specificationAttributeError) {
    console.error("Load variant specification attributes failed:", specificationAttributeError);
    throw new Error("Gagal memuat atribut spesifikasi.");
  }

  const specificationAttributeIds = (specificationAttributes ?? []).map((item) => item.id);
  const [{ data: specificationMappings, error: specificationMappingError }, { data: specificationValues, error: specificationValuesError }] =
    specificationAttributeIds.length
      ? await Promise.all([
          auth.supabase
            .from("product_variant_attribute_values")
            .select("attribute_id, attribute_value_id")
            .eq("product_variant_id", variantId)
            .in("attribute_id", specificationAttributeIds),
          auth.supabase
            .from("product_attribute_values")
            .select("id, attribute_id, value_name")
            .in("attribute_id", specificationAttributeIds)
            .eq("is_active", true)
            .order("value_name", { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  if (specificationMappingError || specificationValuesError) {
    console.error("Load variant specifications failed:", {
      specificationMappingError,
      specificationValuesError,
    });
    throw new Error("Gagal memuat nilai spesifikasi varian.");
  }

  const initialSpecifications = Object.fromEntries(
    specificationFields.map((field) => {
      const attribute = specificationAttributes?.find(
        (item) => item.attribute_code === field.code
      );
      const mapping = specificationMappings?.find(
        (item) => item.attribute_id === attribute?.id
      );
      const value = specificationValues?.find(
        (item) => item.id === mapping?.attribute_value_id
      );
      return [field.code, value?.value_name ?? ""];
    })
  );

  const specificationOptions = Object.fromEntries(
    specificationFields.map((field) => {
      const attribute = specificationAttributes?.find(
        (item) => item.attribute_code === field.code
      );
      return [
        field.code,
        (specificationValues ?? [])
          .filter((item) => item.attribute_id === attribute?.id)
          .map((item) => item.value_name),
      ];
    })
  );

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

          {errorCode === "specifications_save_failed" && (
            <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Data dasar varian sudah tersimpan, tetapi sebagian spesifikasi gagal disimpan. Periksa izin master.create dan simpan kembali spesifikasi.
            </div>
          )}
          <EditVariantForm
            productId={id}
            variantId={variantId}
            variantSku={variant.variant_sku}
            initialVariantName={variant.variant_name}
            initialBarcode={variant.barcode ?? ""}
            initialSpecifications={initialSpecifications}
            specificationOptions={specificationOptions}
          />
        </div>
      </main>
    </div>
  );
}
