import Link from "next/link";
import {redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";
import InvoiceComposer from "../invoice-composer";
import InvoiceDoSelector from "../invoice-do-selector";

export const metadata={title:"Buat Invoice | HEXA CORE ERP"};
type InvoiceLine = {
 id:string; delivered:number; already_invoiced:number; product_name:string;
 variant_sku:string; variant_name:string; unit_price:number;
};
const money=(value:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);

export default async function NewInvoicePage({searchParams}:{searchParams:Promise<{delivery_order_id?:string}>}) {
 await connection();
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.create");
 if(!user) redirect("/login");
 if(!profile||!authorized) redirect("/sales/invoices?error=permission_denied");

 const params=await searchParams;
 const {data:orders,error:ordersError}=await supabase.from("delivery_orders")
  .select("id,delivery_order_number,delivery_date,customers(customer_name),sales_orders(sales_order_number)")
  .eq("status","posted").order("delivery_date",{ascending:false}).limit(100);
 const selectedId=params.delivery_order_id??"";
 const selected=orders?.find(order=>order.id===selectedId);
 let lines:InvoiceLine[]=[];
 let lineError:string|null=null;

 if(selected){
  const {data,error}=await supabase.from("delivery_order_items")
   .select("id,quantity,sales_order_item_id,sales_order_items(unit_price,products(product_name),product_variants(variant_sku,variant_name)),sales_invoice_items(quantity,sales_invoices(status))")
   .eq("delivery_order_id",selected.id).order("created_at");
  if(error){
   console.error("Load invoice delivery order details failed:",error);
   lineError="Rincian barang DO gagal dimuat. Tidak ada invoice yang dapat diterbitkan dari data yang belum terbaca.";
  } else {
   lines=(data??[]).map(row=>{
    const so=Array.isArray(row.sales_order_items)?row.sales_order_items[0]:row.sales_order_items;
    const product=Array.isArray(so?.products)?so.products[0]:so?.products;
    const variant=Array.isArray(so?.product_variants)?so.product_variants[0]:so?.product_variants;
    const invoiced=(row.sales_invoice_items??[]).filter(item=>{
     const invoice=Array.isArray(item.sales_invoices)?item.sales_invoices[0]:item.sales_invoices;
     return invoice&&invoice.status!=="void";
    }).reduce((sum:number,item)=>sum+Number(item.quantity),0);
    return {id:row.id,delivered:Number(row.quantity),already_invoiced:invoiced,product_name:product?.product_name??"Produk",variant_sku:variant?.variant_sku??"—",variant_name:variant?.variant_name??"",unit_price:Number(so?.unit_price??0)};
   });
  }
 }

 const customerOf=(order:any)=>Array.isArray(order.customers)?order.customers[0]:order.customers;
 const soOf=(order:any)=>Array.isArray(order.sales_orders)?order.sales_orders[0]:order.sales_orders;
 const remainingLines=lines.filter(line=>line.delivered>line.already_invoiced);
 const remainingValue=remainingLines.reduce((sum,line)=>sum+(line.delivered-line.already_invoiced)*line.unit_price,0);

 return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
  <Link href="/sales/invoices" className="text-sm font-semibold text-blue-700">← Daftar Invoice</Link>
  <header><h1 className="text-2xl font-bold">Buat Invoice</h1><p className="mt-1 text-sm text-slate-500">Pilih Delivery Order yang sudah selesai. Kuantitas yang sudah ditagih tidak dapat ditagih ulang.</p></header>

  {ordersError?<p role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Daftar Delivery Order gagal dimuat. Periksa koneksi dan akses, lalu muat ulang halaman.</p>:<InvoiceDoSelector orders={(orders??[]).map(order=>({id:order.id,delivery_order_number:order.delivery_order_number,delivery_date:order.delivery_date,customer_name:customerOf(order)?.customer_name??"Pelanggan"}))} selectedId={selectedId}/>}

  {selectedId&&!selected&&<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">DO yang dipilih tidak ditemukan dalam daftar DO berstatus posted. Pilih ulang DO yang valid. Form invoice tidak ditampilkan.</div>}

  {selected&&<section className="space-y-4">
   <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
     <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detail Delivery Order</p><h2 className="mt-1 text-lg font-bold">{selected.delivery_order_number}</h2><p className="text-sm text-slate-500">Tanggal pengiriman: {selected.delivery_date}</p></div>
     <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Posted / Selesai</span>
    </div>
    <div className="grid gap-3 py-4 sm:grid-cols-2">
     <div><p className="text-xs text-slate-500">Pelanggan</p><p className="font-semibold">{customerOf(selected)?.customer_name??"—"}</p></div>
     <div><p className="text-xs text-slate-500">Sales Order Sumber</p><p className="font-semibold">{soOf(selected)?.sales_order_number??"—"}</p></div>
    </div>
    {lineError?<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{lineError}</p>:!lines.length?<p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">DO ditemukan, tetapi tidak memiliki detail barang yang dapat dibaca. Pembuatan invoice dinonaktifkan.</p>:<div className="overflow-x-auto">
     <table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Produk / Varian</th><th className="p-3">SKU</th><th className="p-3 text-right">Terkirim</th><th className="p-3 text-right">Sudah masuk invoice</th><th className="p-3 text-right">Sisa</th><th className="p-3 text-right">Harga</th></tr></thead><tbody className="divide-y">{lines.map(line=>{const remaining=Math.max(0,line.delivered-line.already_invoiced);return <tr key={line.id}><td className="p-3"><p className="font-medium">{line.product_name}</p><p className="text-xs text-slate-500">{line.variant_name}</p></td><td className="p-3">{line.variant_sku}</td><td className="p-3 text-right tabular-nums">{line.delivered}</td><td className="p-3 text-right tabular-nums">{line.already_invoiced}</td><td className="p-3 text-right font-semibold tabular-nums">{remaining}</td><td className="p-3 text-right tabular-nums">{money(line.unit_price)}</td></tr>})}</tbody></table>
    </div>}
    {!lineError&&lines.length>0&&<div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><span className="text-slate-500">Estimasi nilai sisa yang dapat ditagihkan</span><strong>{money(remainingValue)}</strong></div>}
   </div>
   {lineError?null:!lines.length?null:!remainingLines.length?<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Seluruh kuantitas DO ini sudah masuk invoice. Tidak ada sisa yang dapat ditagihkan.</p>:<InvoiceComposer key={selected.id} deliveryOrderId={selected.id} lines={remainingLines}/>}
  </section>}
 </div></main></div>;
}
