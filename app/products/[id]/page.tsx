
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
      <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />
        <main className="min-w-0 flex-1 p-4 md:h-screen md:overflow-y-auto md:p-6">
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
      category:product_categories(category_name),
      brand:brands(brand_name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Product detail fetch error:", error);

    return (
      <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
        <ErpSidebar activePath="/products" />
        <main className="min-w-0 flex-1 p-4 md:h-screen md:overflow-y-auto md:p-6">
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
  const { data: variants, error: variantsError } = await supabase
  .from("product_variants")
  .select("id, variant_sku, variant_name, barcode, is_active")
  .eq("product_id", id)
  .order("created_at", { ascending: false });

if (variantsError) {
  console.error("Product variants fetch error:", variantsError);
  throw new Error("Gagal mengambil data varian produk.");
}

  const category = product.category as unknown as
    | { category_name: string }
    | null;

  const brand = product.brand as unknown as
    | { brand_name: string }
    | null;

  const productType =
    product.product_type === "goods" ? "Barang" : "Jasa";

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

      <main className="min-w-0 flex-1 p-4 md:h-screen md:overflow-y-auto md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
                Informasi lengkap data master produk.
              </p>
            </div>

            {canUpdate.data === true && (
  <div className="flex flex-wrap gap-3">
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
          </div>

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
              <DetailItem label="Barcode" value={product.barcode || "-"} />
              <DetailItem
                label="Nama Produk"
                value={product.product_name}
              />
              <DetailItem
                label="Kategori"
                value={category?.category_name ?? "-"}
              />
              <DetailItem
                label="Brand"
                value={brand?.brand_name ?? "-"}
              />
              <DetailItem label="Jenis Produk" value={productType} />
              <DetailItem label="Tracking" value={trackingType} />
              <DetailItem label="Unit" value={product.unit} />
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
              <p className="text-sm text-slate-500">Deskripsi</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                {product.description || "-"}
              </p>
            </div>
          </section>

          {/* PRODUCT VARIANTS */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Product Variants
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Daftar SKU turunan dari produk ini.
                </p>
              </div>

              <Link
                href={`/products/${product.id}/variants`}
                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                Kelola Variant
              </Link>
            </div>

            {!variants || variants.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-slate-500">
                  Belum ada variant untuk produk ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-3">SKU Variant</th>
                      <th className="px-6 py-3">Nama Variant</th>
                      <th className="px-6 py-3">Barcode</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {variants.map((variant) => (
                      <tr key={variant.id}>
                        <td className="px-6 py-4 font-medium text-blue-600">
                          <Link
                            href={`/products/${product.id}/variants/${variant.id}`}
                            className="hover:underline"
                          >
                            {variant.variant_sku}
                          </Link>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {variant.variant_name}
                        </td>

                        <td className="px-6 py-4 text-slate-600">
                          {variant.barcode || "-"}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              variant.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {variant.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
