export const instant = false;

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

import PurchaseOrderForm from "./purchase-order-form";

export const metadata = {
  title: "Buat Purchase Order | HEXACORE ERP",
  description: "Membuat pesanan pembelian baru",
};

async function PurchaseOrderPageContent() {
  // Memastikan proses berikutnya dijalankan pada waktu request.
  await connection();

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.create");

  if (!user) redirect("/login");

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  const [supplierResult, warehouseResult, variantResult] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, supplier_code, supplier_name, currency_code, payment_term_days"
        )
        .eq("is_active", true)
        .order("supplier_name"),

      supabase
        .from("warehouses")
        .select("id, warehouse_code, warehouse_name")
        .eq("is_active", true)
        .order("warehouse_name"),

      supabase
        .from("product_variants")
        .select(`
          id,
          variant_sku,
          variant_name,
          product:products!inner (
            id,
            sku,
            product_name,
            product_type,
            tracking_type,
            is_active
          )
        `)
        .eq("is_active", true)
        .eq("products.is_active", true)
        .order("variant_sku"),
    ]);

  const loadError =
    supplierResult.error ||
    warehouseResult.error ||
    variantResult.error;

  if (loadError) {
    console.error("Purchase Order master data error:", loadError);
  }

  const suppliers = supplierResult.data ?? [];
  const warehouses = warehouseResult.data ?? [];

  const variants = (variantResult.data ?? [])
    .map((variant: any) => {
      const product = Array.isArray(variant.product)
        ? variant.product[0]
        : variant.product;

      return {
        id: variant.id,
        variant_sku: variant.variant_sku,
        variant_name: variant.variant_name,
        product_id: product?.id ?? "",
        product_sku: product?.sku ?? "",
        product_name: product?.product_name ?? "",
        product_type: product?.product_type ?? "",
        tracking_type: product?.tracking_type ?? "",
      };
    })
    .filter((variant: any) => variant.product_id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/purchases"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Kembali ke Purchase Order
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Buat Purchase Order
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Masukkan informasi supplier dan daftar produk yang akan dibeli.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="font-semibold text-red-700">
            Gagal mengambil data master
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Periksa permission dan koneksi database, kemudian coba kembali.
          </p>
        </div>
      ) : suppliers.length === 0 ||
        warehouses.length === 0 ||
        variants.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-white p-6">
          <h2 className="font-semibold text-amber-800">
            Data master belum lengkap
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Pastikan tersedia supplier aktif, warehouse aktif, serta
            produk dan varian aktif sebelum membuat Purchase Order.
          </p>
        </div>
      ) : (
        <PurchaseOrderForm
          suppliers={suppliers}
          warehouses={warehouses}
          variants={variants}
        />
      )}
    </div>
  );
}

function PurchaseOrderLoading() {
  return (
    <div className="mx-auto max-w-6xl rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-slate-600">
        Memuat data Purchase Order...
      </p>
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/purchases" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <Suspense fallback={<PurchaseOrderLoading />}>
          <PurchaseOrderPageContent />
        </Suspense>
      </main>
    </div>
  );
}