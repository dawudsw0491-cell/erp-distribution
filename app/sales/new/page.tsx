import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import SalesOrderForm from "./sales-order-form";

export const metadata={title:"Buat Penjualan | HEXA CORE ERP"};
export default async function NewSalesPage() {
 await connection();
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.create");
 if(!user) redirect("/login");
 if(!profile||!authorized) redirect("/sales?error=permission_denied");
 const [customers,warehouses,products,variants]=await Promise.all([
  supabase.from("customers").select("id,customer_code,customer_name").eq("is_active",true).order("customer_name"),
  supabase.from("warehouses").select("id,warehouse_code,warehouse_name").eq("is_active",true).order("warehouse_name"),
  supabase.from("products").select("id,product_name,tracking_type").eq("is_active",true).eq("product_type","goods"),
  supabase.from("product_variants").select("id,product_id,variant_sku,variant_name").eq("is_active",true).order("variant_sku")
 ]);
 const productMap=new Map((products.data??[]).map(p=>[p.id,p]));
 const items=(variants.data??[]).flatMap(v=>{const p=productMap.get(v.product_id);return p?[{id:v.id,variant_sku:v.variant_sku,variant_name:v.variant_name,product_name:p.product_name,tracking_type:p.tracking_type}]:[];});
 return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-5"><Link href="/sales" className="text-sm font-semibold text-blue-700">← Kembali ke Penjualan</Link><div><h1 className="text-2xl font-bold">Buat Penjualan</h1><p className="mt-1 text-sm text-slate-600">Catat pelanggan, warehouse, dan detail produk.</p></div><SalesOrderForm customers={customers.data??[]} warehouses={warehouses.data??[]} variants={items}/></div></main></div>;
}
