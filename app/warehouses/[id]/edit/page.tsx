
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import EditWarehouseForm from "./edit-warehouse-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function EditWarehouseContent({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const auth = await getAuthorizationContext("master.view");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/");

  const { data: warehouse, error } = await auth.supabase
    .from("warehouses")
    .select(
      "id, warehouse_code, warehouse_name, address, city, province, postal_code, contact_person, phone"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Gagal mengambil data warehouse.");
  }

  if (!warehouse) {
    notFound();
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <ErpSidebar activePath="/warehouses" />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-7">
            <Link
              href="/warehouses"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Kembali ke Master Warehouse
            </Link>

            <p className="mt-5 text-sm font-medium text-blue-600">
              Inventory / Master Warehouse
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Edit Warehouse
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              Perbarui informasi warehouse perusahaan.
            </p>
          </div>

          <EditWarehouseForm warehouse={warehouse} />
        </div>
      </main>
    </div>
  );
}

export default function EditWarehousePage(props: PageProps) {
  return (
    <Suspense fallback={<div className="p-8">Memuat data warehouse...</div>}>
      <EditWarehouseContent params={props.params} />
    </Suspense>
  );
}
