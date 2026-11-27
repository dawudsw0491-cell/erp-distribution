import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";
import SalesOrderForm from "../../new/sales-order-form";

export const metadata={title:"Edit Draft Penjualan | HEXA CORE ERP"};

export default async function EditSalesOrderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  await connection();
  const {id}=await params;
  const notice=await searchParams;
  const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.view");
  if(!user) redirect("/login");
  if(!profile||!authorized) redirect("/sales?error=permission_denied");
  const {data:canCreate}=await supabase.rpc("has_permission",{required_permission:"sales.create"});
  if(canCreate!==true) redirect("/sales?error=permission_denied");

  const [orderResult,customers,warehouses,products,variants]=await Promise.all([
    supabase.from("sales_orders").select("id,customer_id,warehouse_id,order_date,notes,status,payment_scheme,payment_due_date").eq("id",id).maybeSingle(),
    supabase.from("customers").select("id,customer_code,customer_name").eq("is_active",true).order("customer_name"),
    supabase.from("warehouses").select("id,warehouse_code,warehouse_name").eq("is_active",true).order("warehouse_name"),
    supabase.from("products").select("id,product_name,tracking_type").eq("is_active",true).eq("product_type","goods"),
    supabase.from("product_variants").select("id,product_id,variant_sku,variant_name").eq("is_active",true).order("variant_sku")
  ]);
  if(orderResult.error){console.error("Draft SO edit load failed:",orderResult.error);return <div className="p-8">Gagal memuat Sales Order.</div>;}
  const order=orderResult.data;
  if(!order) notFound();
  if(order.status!=="draft") redirect(`/sales/${id}?error=only_draft_editable`);

  const linesResult=await supabase.from("sales_order_items")
    .select("product_variant_id,quantity,unit_price")
    .eq("sales_order_id",id).order("created_at");
  if(linesResult.error){console.error("Draft SO lines load failed:",linesResult.error);return <div className="p-8">Gagal memuat detail Sales Order.</div>;}

  if(customers.error||warehouses.error||products.error||variants.error){
    console.error("Draft SO master data load failed",{customers:customers.error,warehouses:warehouses.error,products:products.error,variants:variants.error});
    return <div className="min-h-screen bg-slate-100 p-8"><p className="rounded-lg border border-red-200 bg-white p-5 text-sm text-red-700">Form edit tidak dapat dimuat lengkap karena data master gagal dibaca. Draft tidak diubah.</p></div>;
  }
  const productMap=new Map((products.data??[]).map(p=>[p.id,p]));
  const variantOptions=(variants.data??[]).flatMap(v=>{
    const p=productMap.get(v.product_id);
    return p?[{id:v.id,variant_sku:v.variant_sku,variant_name:v.variant_name,product_name:p.product_name,tracking_type:p.tracking_type}]:[];
  });
  const validVariantIds=new Set(variantOptions.map(v=>v.id));
  const initialItems=(linesResult.data??[])
    .filter(line=>validVariantIds.has(line.product_variant_id))
    .map(line=>({product_variant_id:line.product_variant_id,quantity:String(line.quantity),unit_price:String(line.unit_price)}));
  if(initialItems.length!==(linesResult.data??[]).length){
    return <div className="p-8 text-red-700">Draft tidak dapat diedit: terdapat Product Variant nonaktif atau tidak tersedia. Data tidak diubah.</div>;
  }

  return <div className="min-h-screen bg-slate-100 md:flex">
    <ErpSidebar activePath="/sales"/>
    <main className="min-w-0 flex-1 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Link href={`/sales/${id}`} className="text-sm font-semibold text-blue-700">← Kembali ke Detail Penjualan</Link>
        <div><h1 className="text-2xl font-bold">Edit Draft Penjualan</h1><p className="mt-1 text-sm text-slate-600">Hanya Sales Order berstatus draft tanpa Delivery Order yang dapat diubah.</p></div>
        {notice.error&&<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Perubahan gagal: {notice.error}</p>}
        <SalesOrderForm
          mode="edit"
          salesOrderId={id}
          customers={customers.data??[]}
          warehouses={warehouses.data??[]}
          variants={variantOptions}
          initial={{
            customerId:order.customer_id,
            warehouseId:order.warehouse_id,
            orderDate:order.order_date,
            notes:order.notes??"",
            paymentScheme:order.payment_scheme==="unspecified"?"":order.payment_scheme,
            paymentDueDate:order.payment_due_date,
            items:initialItems
          }}
        />
      </div>
    </main>
  </div>;
}
