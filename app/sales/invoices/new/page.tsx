import Link from "next/link";
import {redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";
import InvoiceComposer from "../invoice-composer";

export const metadata={title:"Buat Invoice | HEXA CORE ERP"};
type InvoiceLine = { id: string; delivered: number; already_invoiced: number; product_name: string; variant_sku: string; variant_name: string; unit_price: number };
export default async function NewInvoicePage({searchParams}:{searchParams:Promise<{delivery_order_id?:string}>}) {
 await connection();
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.create");
 if(!user) redirect("/login");
 if(!profile||!authorized) redirect("/sales/invoices?error=permission_denied");
 const params=await searchParams;
 const {data:orders,error:ordersError}=await supabase.from("delivery_orders").select("id,delivery_order_number,delivery_date,customers(customer_name),sales_orders(sales_order_number)").eq("status","posted").order("delivery_date",{ascending:false}).limit(100);
 const selectedId=params.delivery_order_id??"";
 const selected=orders?.find((order)=>order.id===selectedId);
 let lines: InvoiceLine[] = [];
 let lineError=false;
 if(selected){
  const {data,error}=await supabase.from("delivery_order_items").select("id,quantity,sales_order_item_id,sales_order_items(unit_price,products(product_name),product_variants(variant_sku,variant_name)),sales_invoice_items(quantity,sales_invoices(status))").eq("delivery_order_id",selected.id);
  lineError=Boolean(error);
  lines=(data??[]).map((row)=>{const so=Array.isArray(row.sales_order_items)?row.sales_order_items[0]:row.sales_order_items;const product=Array.isArray(so?.products)?so.products[0]:so?.products;const variant=Array.isArray(so?.product_variants)?so.product_variants[0]:so?.product_variants;const invoiced=(row.sales_invoice_items??[]).filter((item)=>{const invoice=Array.isArray(item.sales_invoices)?item.sales_invoices[0]:item.sales_invoices;return invoice&&invoice.status!=="void";}).reduce((sum:number,item)=>sum+Number(item.quantity),0);return {id:row.id,delivered:Number(row.quantity),already_invoiced:invoiced,product_name:product?.product_name??"Produk",variant_sku:variant?.variant_sku??"—",variant_name:variant?.variant_name??"",unit_price:Number(so?.unit_price??0)};});
 }
 return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6"><Link href="/sales/invoices" className="text-sm font-semibold text-blue-700">← Daftar Invoice</Link><header><h1 className="text-2xl font-bold">Buat Invoice</h1><p className="mt-1 text-sm text-slate-500">Pilih Delivery Order yang sudah posted. Kuantitas yang sudah ditagih tidak dapat ditagih ulang.</p></header>
 {ordersError?<p className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Daftar Delivery Order gagal dimuat.</p>:<form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><label className="block text-sm font-medium">Delivery Order<select name="delivery_order_id" defaultValue={selectedId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value="">Pilih Delivery Order</option>{(orders??[]).map((order)=><option key={order.id} value={order.id}>{order.delivery_order_number} · {order.delivery_date} · {(Array.isArray(order.customers)?order.customers[0]:order.customers)?.customer_name??"Pelanggan"}</option>)}</select><button className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold">Muat Detail DO</button></label></form>}
 {selected&&<><div className="rounded-xl border bg-white p-4 text-sm"><p><strong>{selected.delivery_order_number}</strong> · {selected.delivery_date}</p><p className="text-slate-500">{(Array.isArray(selected.customers)?selected.customers[0]:selected.customers)?.customer_name??"—"} · {(Array.isArray(selected.sales_orders)?selected.sales_orders[0]:selected.sales_orders)?.sales_order_number??"—"}</p></div>{lineError?<p className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Detail DO atau histori invoice gagal dimuat.</p>:<InvoiceComposer deliveryOrderId={selected.id} lines={lines.filter(line=>line.delivered>line.already_invoiced)}/>}</>}
 </div></main></div>;
}
