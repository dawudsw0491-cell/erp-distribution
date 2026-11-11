
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductModelEditForm from "./edit-form";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getErrorMessage(error?: string) {
  switch (error) {
    case "required":
      return "Model Code dan Model Name wajib diisi.";
    case "invalid_code":
      return "Model Code hanya boleh berisi huruf, angka, tanda hubung, dan underscore.";
    case "invalid_length":
      return "Panjang data melebihi batas yang diizinkan.";
    case "duplicate_code":
      return "Model Code sudah digunakan oleh Brand ini.";
    case "duplicate_name":
      return "Model Name sudah digunakan oleh Brand ini.";
    case "duplicate":
      return "Data Product Model sudah terdaftar.";
    case "lookup_failed":
      return "Gagal memeriksa duplikasi data.";
    case "save_failed":
      return "Gagal menyimpan perubahan Product Model.";
    default:
      return null;
  }
}

export default async function EditProductModelPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect("/product-models?error=forbidden");
  }

  const { data: model, error: modelError } = await auth.supabase
    .from("product_models")
    .select(
      "id, brand_id, model_code, model_name, description, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (modelError) {
    console.error("Load Product Model for edit failed:", modelError);
    redirect("/product-models?error=load_failed");
  }

  if (!model) {
    notFound();
  }

  const [
    { data: brand, error: brandError },
    { count: productCount, error: productError },
    updateAuth,
  ] = await Promise.all([
    auth.supabase
      .from("brands")
      .select("id, brand_code, brand_name")
      .eq("id", model.brand_id)
      .maybeSingle(),

    auth.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("model_id", id),

    getAuthorizationContext("master.update"),
  ]);

  if (brandError || productError) {
    console.error("Load Product Model relations failed:", {
      brandError,
      productError,
    });
    redirect(`/product-models/${id}`);
  }

  if (!brand) {
    redirect("/product-models?error=brand_not_found");
  }

  if (!updateAuth.user) {
    redirect("/login");
  }

  if (!updateAuth.authorized) {
    redirect(`/product-models/${id}?error=forbidden`);
  }

  const errorMessage = getErrorMessage(query.error);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <ErpSidebar activePath="/product-models" />

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">
                Master Data / Product Model
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Edit Product Model
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Perbarui informasi model produk.
              </p>
            </div>

            <Link
              href={`/product-models/${id}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Detail
            </Link>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 border-b border-slate-200 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Informasi Product Model
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Periksa kembali informasi sebelum menyimpan perubahan.
              </p>
            </div>

            <ProductModelEditForm
              model={{
                id: model.id,
                brandId: model.brand_id,
                brandName: brand.brand_name,
                brandCode: brand.brand_code,
                modelCode: model.model_code,
                modelName: model.model_name,
                description: model.description ?? "",
              }}
              productCount={productCount ?? 0}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
