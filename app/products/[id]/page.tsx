
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductStatusButton from "./product-status-button";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

type BrandRelation = {
  brand_name?: string;
} | null;

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-b border-slate-100 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  await connection();

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const { supabase, user, profile, authorized } =
    await getAuthorizationContext("master.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:overflow-hidden">
        <ErpSidebar activePath="/products" />

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-red-700">
              Akses Ditolak
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Anda tidak memiliki izin untuk melihat detail produk.
            </p>

            <Link
              href="/products"
              className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Kembali ke Produk
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { data: product, error } = await supabase
    .from("products")
    .select(`
      id,
      sku,
      barcode,
      product_name,
      product_type,
      tracking_type,
      unit,
      description,
      minimum_stock,
      is_active,
      created_at,
      updated_at,
      category_id,
      product_condition,
      brand:brands(brand_name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Product detail fetch error:", error);

    return (
      <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:overflow-hidden">
        <ErpSidebar activePath="/products" />

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-red-700">
              Gagal Memuat Produk
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil data produk.
            </p>

            <Link
              href="/products"
              className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Kembali ke Produk
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    notFound();
  }

  const { data: productVariants, error: productVariantsError } = await supabase
    .from("product_variants")
    .select("id, variant_sku, variant_name, barcode, is_active")
    .eq("product_id", id)
    .order("created_at", { ascending: true });

  if (productVariantsError) {
    console.error("Product variants fetch error:", productVariantsError);
    throw new Error("Gagal mengambil daftar SKU produk.");
  }

  const variantIds = (productVariants ?? []).map((variant) => variant.id);
  const { data: variantMappings, error: variantMappingsError } = variantIds.length
    ? await supabase
        .from("product_variant_attribute_values")
        .select("product_variant_id, attribute_id, attribute_value_id")
        .in("product_variant_id", variantIds)
    : { data: [], error: null };

  if (variantMappingsError) {
    console.error("Product variant specifications fetch error:", variantMappingsError);
    throw new Error("Gagal mengambil spesifikasi SKU.");
  }

  const attributeIds = [...new Set((variantMappings ?? []).map((item) => item.attribute_id))];
  const valueIds = [...new Set((variantMappings ?? []).map((item) => item.attribute_value_id))];
  let attributes: Array<{ id: string; attribute_code: string }> = [];
  let attributeValues: Array<{ id: string; value_name: string }> = [];

  if (attributeIds.length > 0) {
    const { data, error: attributesError } = await supabase
      .from("product_attributes")
      .select("id, attribute_code")
      .in("id", attributeIds);
    if (attributesError) throw new Error("Gagal mengambil kamus atribut SKU.");
    attributes = data ?? [];
  }

  if (valueIds.length > 0) {
    const { data, error: valuesError } = await supabase
      .from("product_attribute_values")
      .select("id, value_name")
      .in("id", valueIds);
    if (valuesError) throw new Error("Gagal mengambil nilai spesifikasi SKU.");
    attributeValues = data ?? [];
  }
  const attributeCodeById = new Map(attributes.map((item) => [item.id, item.attribute_code]));
  const attributeValueById = new Map(attributeValues.map((item) => [item.id, item.value_name]));
  const specificationsByVariant = new Map<string, Record<string, string>>();
  for (const mapping of variantMappings ?? []) {
    const code = attributeCodeById.get(mapping.attribute_id);
    const value = attributeValueById.get(mapping.attribute_value_id);
    if (!code || !value) continue;
    const current = specificationsByVariant.get(mapping.product_variant_id) ?? {};
    current[code] = value;
    specificationsByVariant.set(mapping.product_variant_id, current);
  }

  let categoryName = "-";

  if (product.category_id) {
    const { data: category, error: categoryError } = await supabase
      .from("product_categories")
      .select("category_name")
      .eq("id", product.category_id)
      .maybeSingle();

    if (categoryError) {
      console.error("Product category fetch error:", categoryError);
    } else {
      categoryName = category?.category_name ?? "-";
    }
  }

  const brand = product.brand as unknown as BrandRelation;

  const productType =
    product.product_type === "goods" ? "Barang" : "Jasa";

  const conditionLabels: Record<string, string> = {
    BARU: "Baru",
    SECOND: "Second",
  };

  const productCondition =
    product.product_type === "service"
      ? "-"
      : product.product_condition
        ? conditionLabels[String(product.product_condition)] ??
          String(product.product_condition)
        : "Belum ditentukan (data lama)";

  const trackingLabels: Record<string, string> = {
    quantity: "Kuantitas",
    imei: "IMEI",
    serial: "Serial Number",
  };

  const trackingType =
    trackingLabels[String(product.tracking_type)] ??
    String(product.tracking_type);

  const canUpdate = await supabase.rpc("has_permission", {
    required_permission: "master.update",
  });

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/products" />

      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href="/products"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                ← Kembali ke Produk
              </Link>

              <h1 className="mt-3 text-2xl font-bold text-slate-800">
                Detail Produk
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Informasi lengkap master produk dan SKU.
              </p>
            </div>

            {canUpdate.data === true && (
              <div className="flex flex-wrap gap-3">
                <Link href={`/products/${product.id}/variants`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Kelola SKU & Varian</Link>
                <Link
                  href={`/products/${product.id}/edit`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Edit Produk
                </Link>

                <ProductStatusButton
                  productId={product.id}
                  isActive={product.is_active}
                />
              </div>
            )}
          </header>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  {product.product_name}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  SKU: {product.sku}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  product.is_active
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {product.is_active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-800">
              Informasi Produk
            </h2>

            <div className="mt-2 grid gap-x-8 md:grid-cols-2">
              <DetailItem label="SKU" value={product.sku} />

              <DetailItem
                label="Barcode"
                value={product.barcode || "-"}
              />

              <DetailItem
                label="Nama Produk"
                value={product.product_name}
              />

              <DetailItem
                label="Brand"
                value={brand?.brand_name ?? "-"}
              />

              <DetailItem
                label="Jenis Produk"
                value={productType}
              />

              <DetailItem
                label="Kondisi Produk"
                value={productCondition}
              />

              <DetailItem
                label="Kategori Utama"
                value={categoryName}
              />

              <DetailItem
                label="Tracking"
                value={trackingType}
              />

              <DetailItem
                label="Unit"
                value={product.unit}
              />

              <DetailItem
                label="Minimum Stock"
                value={Number(product.minimum_stock).toLocaleString("id-ID")}
              />

              <DetailItem
                label="Status"
                value={product.is_active ? "Aktif" : "Nonaktif"}
              />
            </div>

            <div className="mt-4">
              <p className="text-sm text-slate-500">
                Deskripsi / Spesifikasi
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                {product.description || "-"}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Varian, SKU, Spesifikasi & Garansi</h2>
                <p className="mt-1 text-sm text-slate-500">Seluruh SKU dan spesifikasi yang melekat pada produk ini.</p>
              </div>
              <Link href={`/products/${product.id}/variants`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Lihat & Kelola Varian</Link>
            </div>
            {productVariants && productVariants.length > 0 ? (
              <div className="mt-4 space-y-3">
                {productVariants.map((variant) => {
                  const specs = specificationsByVariant.get(variant.id) ?? {};
                  return (
                    <div key={variant.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">{variant.variant_name}</p>
                          <p className="mt-1 text-sm text-blue-700">{variant.variant_sku}</p>
                          <p className="mt-1 text-xs text-slate-500">Barcode: {variant.barcode || "-"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${variant.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{variant.is_active ? "Aktif" : "Nonaktif"}</span>
                          <Link href={`/products/${product.id}/variants/${variant.id}`} className="text-sm text-blue-600 hover:underline">Detail SKU</Link>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        {(["RAM", "ROM", "COLOR", "WARRANTY"] as const).map((code) => (
                          <div key={code} className="rounded-md bg-slate-50 p-3">
                            <p className="text-xs text-slate-500">{code === "COLOR" ? "Warna" : code === "WARRANTY" ? "Garansi" : code}</p>
                            <p className="mt-1 text-sm font-medium text-slate-800">{specs[code] || "-"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Belum ada SKU varian untuk produk ini.
                <div className="mt-2"><Link href={`/products/${product.id}/variants`} className="font-medium text-blue-600 hover:underline">Buka pengelolaan SKU</Link></div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-800">
              Informasi Sistem
            </h2>

            <div className="mt-2 grid gap-x-8 md:grid-cols-2">
              <DetailItem
                label="Dibuat Pada"
                value={formatDate(product.created_at)}
              />

              <DetailItem
                label="Terakhir Diperbarui"
                value={formatDate(product.updated_at)}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
