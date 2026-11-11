
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import StatusToggleForm from "./status-toggle-form";

export const metadata = {
  title: "Detail Attribute Value | ERP HEXACORE",
};

export const instant = false;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function ProductAttributeValueDetailPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  const { supabase, authorized } =
    await getAuthorizationContext("master.view");

  if (!authorized) {
    redirect("/dashboard");
  }

  const { data: item, error } = await supabase
    .from("product_attribute_values")
    .select(`
      id,
      attribute_id,
      value_code,
      value_name,
      description,
      is_active,
      created_at,
      updated_at,
      product_attributes (
        id,
        attribute_code,
        attribute_name
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal mengambil detail: ${error.message}`);
  }

  if (!item) {
    notFound();
  }

  const attribute = Array.isArray(item.product_attributes)
    ? item.product_attributes[0] ?? null
    : item.product_attributes;

  const formatDate = (value: string | null) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const successMessage: Record<string, string> = {
    created: "Attribute Value berhasil dibuat.",
    updated: "Attribute Value berhasil diperbarui.",
    activated: "Attribute Value berhasil diaktifkan.",
    deactivated: "Attribute Value berhasil dinonaktifkan.",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/product-attribute-values"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Kembali ke Attribute Values
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {item.value_name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Detail Product Attribute Value
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/product-attribute-values/${item.id}/edit`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit Attribute Value
            </Link>

            <StatusToggleForm
  id={item.id}
  isActive={item.is_active}
/>
          </div>
        </div>
      </div>

      {query.success && successMessage[query.success] && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMessage[query.success]}
        </div>
      )}

      {query.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {query.error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Value Code</p>
            <p className="mt-1 font-semibold text-slate-900">
              {item.value_code}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Value Name</p>
            <p className="mt-1 font-semibold text-slate-900">
              {item.value_name}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Parent Attribute</p>
            <p className="mt-1 font-semibold text-slate-900">
              {attribute
                ? `${attribute.attribute_code} - ${attribute.attribute_name}`
                : "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Status</p>
            <span
              className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                item.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.is_active ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="md:col-span-2">
            <p className="text-sm text-slate-500">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-900">
              {item.description || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Created At</p>
            <p className="mt-1 text-sm text-slate-900">
              {formatDate(item.created_at)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Updated At</p>
            <p className="mt-1 text-sm text-slate-900">
              {formatDate(item.updated_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
