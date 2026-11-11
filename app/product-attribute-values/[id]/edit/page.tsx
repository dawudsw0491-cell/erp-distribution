
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import AttributeValueEditForm from "./edit-form";

export const metadata = {
  title: "Edit Attribute Value | ERP HEXACORE",
};

export const instant = false;

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditProductAttributeValuePage({
  params,
}: Props) {
  const { id } = await params;

  const { supabase, authorized } =
    await getAuthorizationContext("master.update");

  if (!authorized) {
    redirect("/product-attribute-values");
  }

  const { data: item, error } = await supabase
    .from("product_attribute_values")
    .select(`
      id,
      attribute_id,
      value_code,
      value_name,
      description,
      is_active
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal mengambil data: ${error.message}`);
  }

  if (!item) {
    notFound();
  }

  const { data: attributes, error: attributeError } = await supabase
    .from("product_attributes")
    .select("id, attribute_code, attribute_name, is_active")
    .order("attribute_name", { ascending: true });

  if (attributeError) {
    throw new Error(
      `Gagal mengambil Parent Attribute: ${attributeError.message}`
    );
  }

  const availableAttributes = (attributes ?? []).filter(
    (attribute) => attribute.is_active || attribute.id === item.attribute_id
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/product-attribute-values/${id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Kembali ke Detail Attribute Value
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Edit Attribute Value
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Perbarui informasi nilai atribut produk.
        </p>
      </div>

      <AttributeValueEditForm
        item={item}
        attributes={availableAttributes}
      />
    </div>
  );
}
