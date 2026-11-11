
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ErpSidebar from "@/components/layout/erp-sidebar";
import CustomerEditForm from "./customer-edit-form";

export const metadata = {
  title: "Edit Pelanggan | HEXACORE ERP",
};

type Props = {
  params: Promise<{ id: string }>;
};

async function CustomerEditContent({ params }: Props) {
  await connection();

  const { id } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    notFound();
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.view");

  if (!authorized) {
    redirect("/customers?error=unauthorized");
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Customer edit data error:", error);
    notFound();
  }

  if (!customer) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <ErpSidebar activePath="/customers" />

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">

          <div className="mb-6 text-sm text-gray-500">
            <Link href="/customers" className="hover:text-blue-600">
              Master Data
            </Link>
            {" / "}
            <Link href="/customers" className="hover:text-blue-600">
              Master Pelanggan
            </Link>
            {" / "}
            <Link
              href={`/customers/${id}`}
              className="hover:text-blue-600"
            >
              Detail
            </Link>
            {" / Edit"}
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Edit Pelanggan
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Perbarui informasi master pelanggan.
              </p>
            </div>

            <Link
              href={`/customers/${id}`}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Kembali ke Detail
            </Link>
          </div>

          <CustomerEditForm customer={customer} />

        </div>
      </main>
    </div>
  );
}

export default function CustomerEditPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          Memuat formulir edit pelanggan...
        </div>
      }
    >
      <CustomerEditContent params={params} />
    </Suspense>
  );
}
