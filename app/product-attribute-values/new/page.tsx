
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import AttributeValueForm from "./attribute-value-form";

export const metadata = {
  title: "Tambah Attribute Value | ERP HEXACORE",
};

export const instant = false;

export default async function NewProductAttributeValuePage() {
  const { supabase, authorized } =
    await getAuthorizationContext("master.create");

  if (!authorized) {
    redirect("/product-attribute-values");
  }

  const { data: attributes, error } = await supabase
    .from("product_attributes")
    .select("id, attribute_code, attribute_name")
    .eq("is_active", true)
    .order("attribute_name", { ascending: true });

  if (error) {
    throw new Error(`Gagal mengambil data atribut: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/product-attribute-values"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Kembali ke Attribute Values
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Tambah Attribute Value
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Tambahkan nilai atribut produk ke master data.
        </p>
      </div>

      <AttributeValueForm attributes={attributes ?? []} />
    </div>
  );
}
