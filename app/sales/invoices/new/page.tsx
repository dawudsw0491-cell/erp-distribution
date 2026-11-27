import Link from "next/link";
import {redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";
import InvoiceComposer from "../invoice-composer";

export const metadata={title:"Buat Invoice | HEXA CORE ERP"};
type InvoiceLine={id:string;delivered:number;already_invoiced:number;product_name:string;variant_sku:string;variant_name:string;unit_price:number};
const money=(value:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);

export default async function NewInvoicePage({searchParams}:{searchParams:Promise<{delivery_order_id?:string}>}) {
 await connection();
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.create");
 if(!user) redirect("/login");
 if(!profile||!authorized) redirect("/sales/invoices?error=permission_denied");
 const {delivery_order_id:id=""}=await searchParams;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) redirect("/sales?error=invalid_delivery_order");

 const {data:order,error:orderError}=await supabase.from("delivery_orders")
  .select("id,delivery_order_number,delivery_date,status,customers(customer_name),sales_orders(id,sales_order_number)")
  .eq("id",id).eq("status","posted").maybeSingle();
 if(orderError){console.error("Load invoice DO failed:",orderError);return <PageError message="Delivery Order gagal dimuat. Tidak ada invoice yang diterbitkan."/>;}
 if(!order) return <PageError message="Delivery Order tidak ditemukan atau belum berstatus posted. Pilih DO yang sudah selesai dari Detail Penjualan."/>;

 const {data,error}=await supabase.from("delivery_order_items")
  .select("id,quantity,sales_order_item_id,sales_order_items(unit_price,products(product_name),product_variants(variant_sku,variant_name)),sales_invoice_items(quantity,sales_invoices(status))")
  .eq("delivery_order_id",order.id);
 if(error){console.error("Load invoice DO lines failed:",error);return <PageError message="Rincian barang dan histori invoice gagal dimuat. Form penerbitan invoice dinonaktifkan."/>;}

 const lines:InvoiceLine[]=(data??[]).map(row=>{
  const so=Array.isArray(row.sales_order_items)?row.sales_order_items[0]:row.sales_order_items;
  const product=Array.isArray(so?.products)?so.products[0]:so?.products;
  const variant=Array.isArray(so?.product_variants)?so.product_variants[0]:so?.product_variants;
  const invoiced=(row.sales_invoice_items??[]).filter(item=>{
   const invoice=Array.isArray(item.sales_invoices)?item.sales_invoices[0]:item.sales_invoices;
   return invoice&&invoice.status!=="void";
  }).reduce((sum:number,item)=>sum+Number(item.quantity),0);
  return {id:row.id,delivered:Number(row.quantity),already_invoiced:invoiced,product_name:product?.product_name??"Produk",variant_sku:variant?.variant_sku??"—",variant_name:variant?.variant_name??"",unit_price:Number(so?.unit_price??0)};
 });
 const customer=Array.isArray(order.customers)?order.customers[0]:order.customers;
 const salesOrder=Array.isArray(order.sales_orders)?order.sales_orders[0]:order.sales_orders;
 const paymentScheme=salesOrder?.payment_scheme??"unspecified";
 const paymentDueDate=salesOrder?.payment_due_date??null;
 if(!["cash","bank_transfer","credit"].includes(paymentScheme)) return <PageError message="Skema pembayaran Sales Order belum ditentukan. Edit SO draft dan pilih Cash, Transfer Bank, atau Kredit sebelum membuat invoice."/>;
 const remaining=lines.filter(line=>line.delivered>line.already_invoiced);
 const remainingValue=remaining.reduce((sum,line)=>sum+(line.delivered-line.already_invoiced)*line.unit_price,0);

 return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-5">
  <Link href={`/sales/${salesOrder?.id??""}`} className="text-sm font-semibold text-blue-700">← Kembali ke Detail Penjualan</Link>
  <header><h1 className="text-2xl font-bold">Buat Invoice</h1><p className="mt-1 text-sm text-slate-500">Detail DO dimuat langsung dari transaksi yang dipilih.</p></header>
  <section className="rounded-xl border bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Order</p><h2 className="mt-1 text-xl font-bold">{order.delivery_order_number}</h2><p className="text-sm text-slate-500">{order.delivery_date} · Sales Order {salesOrder?.sales_order_number??"—"}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Posted / Selesai</span></div>
   <div className="grid gap-3 py-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Pelanggan</p><p className="font-semibold">{customer?.customer_name??"—"}</p></div><div><p className="text-xs text-slate-500">Tanggal DO</p><p className="font-semibold">{order.delivery_date}</p></div></div>
   {!lines.length?<p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">DO ini tidak memiliki rincian barang. Invoice tidak dapat diterbitkan.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Produk / Varian</th><th className="p-3">SKU</th><th className="p-3 text-right">Terkirim</th><th className="p-3 text-right">Sudah diinvoice</th><th className="p-3 text-right">Sisa</th><th className="p-3 text-right">Harga</th></tr></thead><tbody className="divide-y">{lines.map(line=><tr key={line.id}><td className="p-3"><p className="font-medium">{line.product_name}</p><p className="text-xs text-slate-500">{line.variant_name}</p></td><td className="p-3">{line.variant_sku}</td><td className="p-3 text-right">{line.delivered}</td><td className="p-3 text-right">{line.already_invoiced}</td><td className="p-3 text-right font-semibold">{Math.max(0,line.delivered-line.already_invoiced)}</td><td className="p-3 text-right">{money(line.unit_price)}</td></tr>)}</tbody></table></div>}
   {lines.length>0&&<div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><span className="text-slate-500">Estimasi sisa nilai yang dapat ditagihkan</span><strong>{money(remainingValue)}</strong></div>}
  </section>
  {!lines.length?null:!remaining.length?<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Seluruh kuantitas DO sudah masuk invoice. Tidak ada sisa yang dapat ditagihkan.</p>:<InvoiceComposer key={order.id} deliveryOrderId={order.id} lines={remaining} paymentScheme={paymentScheme as "cash"|"bank_transfer"|"credit"} paymentDueDate={paymentDueDate}/>}
 </div></main></div>;
}
function PageError({message}:{message:string}){return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-6"><div className="mx-auto max-w-4xl space-y-4"><Link href="/sales" className="text-sm font-semibold text-blue-700">← Kembali ke Penjualan</Link><p role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">{message}</p></div></main></div>}
