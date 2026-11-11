
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ProductModelForm from "./model-form";

export const instant = false;

const errorMessages: Record<string, string> = {
  required: "Brand, Model Code, dan Model Name wajib diisi.",
  invalid_brand: "Brand tidak ditemukan atau sudah tidak aktif.",
  invalid_length: "Panjang karakter salah satu field melebihi batas.",
  invalid_code: "Format Model Code tidak valid.",
  duplicate_code: "Model Code sudah digunakan untuk Brand tersebut.",
  duplicate_name: "Model Name sudah digunakan untuk Brand tersebut.",
  duplicate: "Data Product Model sudah terdaftar.",
  lookup_failed: "Gagal memeriksa data Product Model.",
  save_failed: "Product Model gagal disimpan. Silakan coba kembali.",
};

type NewProductModelPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function NewProductModelPage({
  searchParams,
}: NewProductModelPageProps) {
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
    redirect("/product-models?error=forbidden");
  }

  const { data: brands, error: brandError } = await auth.supabase
    .from("brands")
    .select("id, brand_name")
    .eq("is_active", true)
    .order("brand_name", { ascending: true });

  if (brandError) {
    console.error("Load Product Model brands failed:", brandError);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/product-models" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              href="/product-models"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Product Models
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Tambah Product Model
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Daftarkan model produk berdasarkan Brand yang telah tersedia
              dalam master data HEXACore.
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
            <ProductModelForm brands={brands ?? []} />
          </div>
        </div>
      </main>
    </div>
  );
}
