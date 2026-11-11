
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const instant = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProductVariantsPage({ params }: Props) {
  await connection();

  const { id } = await params;

  if (!UUID_REGEX.test(id)) notFound();

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
            Anda tidak memiliki izin melihat varian produk.
          </p>
          <Link href={`/products/${id}`} className="mt-4 inline-block text-blue-600">
            Kembali ke Detail Produk
          </Link>
        </main>
      </div>
    );
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, sku, product_name, is_active")
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    console.error("Product fetch error:", productError);
    throw new Error("Gagal mengambil data produk.");
  }

  if (!product) notFound();

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, variant_sku, variant_name, barcode, is_active, created_at")
    .eq("product_id", id)
    .order("created_at", { ascending: false });

  if (variantsError) {
    console.error("Product variants fetch error:", variantsError);
    throw new Error("Gagal mengambil data varian produk.");
  }

  const canCreate = await supabase.rpc("has_permission", {
    required_permission: "master.create",
  });
  console.log("VARIANT CREATE PERMISSION:", {
  userId: user.id,
  data: canCreate.data,
  error: canCreate.error,
});

  const totalVariants = variants?.length ?? 0;
  const activeVariants = variants?.filter((item) => item.is_active).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/products" />

      <main className="min-w-0 flex-1 p-4 md:h-screen md:overflow-y-auto md:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-6 p-0 sm:p-2">

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href={`/products/${id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                ← Kembali ke Detail Produk
              </Link>

              <h1 className="mt-3 text-2xl font-bold text-slate-800">
                Varian Produk
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                {product.product_name} · SKU: {product.sku}
              </p>
            </div>

            {canCreate.data === true && (
              <Link
                href={`/products/${id}/variants/new`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Tambah Varian
              </Link>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Total Varian</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">
                {totalVariants}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Varian Aktif</p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {activeVariants}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Varian Nonaktif</p>
              <p className="mt-2 text-2xl font-bold text-slate-600">
                {totalVariants - activeVariants}
              </p>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800">
                Daftar Varian
              </h2>
            </div>

            {totalVariants === 0 ? (
              <div className="p-10 text-center">
                <p className="font-medium text-slate-700">
                  Belum ada varian produk.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Produk ini masih menggunakan SKU utama.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-3">SKU Varian</th>
                      <th className="px-5 py-3">Nama Varian</th>
                      <th className="px-5 py-3">Barcode</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {variants?.map((variant) => (
                      <tr key={variant.id}>
                        <td className="px-5 py-4 font-medium">
  <Link
    href={`/products/${id}/variants/${variant.id}`}
    className="text-blue-600 hover:text-blue-800 hover:underline"
  >
    {variant.variant_sku}
  </Link>
</td>
                        <td className="px-5 py-4 text-slate-700">
                          {variant.variant_name}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {variant.barcode || "-"}
                        </td>
                        <td className="px-5 py-4">
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
        </div>
      </main>
    </div>
  );
}
