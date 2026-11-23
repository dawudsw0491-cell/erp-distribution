import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";
import {recordInvoicePaymentAction} from "../actions";
import InvoicePrintButton from "../print-button";

export const metadata={title:"Detail Invoice | HEXA CORE ERP"};
const money=(v:number|string)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v??0));
const status:Record<string,string>={issued:"Belum lunas",partially_paid:"Dibayar sebagian",paid:"Lunas",void:"Void"};
export default async function InvoiceDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;created?:string;paid?:string}>}) {
 await connection();
 const {id}=await params,notice=await searchParams;
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.view");
 if(!user) redirect("/login");
 if(!profile||!authorized) redirect("/sales/invoices?error=permission_denied");
 const {data:invoice,error}=await supabase.from("sales_invoices").select("*,customers(customer_code,customer_name,phone,email,address,tax_number),warehouses(warehouse_name)").eq("id",id).maybeSingle();
 if(error){return <div className="p-8 text-red-700">Invoice gagal dimuat.</div>;}
 if(!invoice) notFound();
 const [{data:lines,error:linesError},{data:payments,error:paymentsError},canPay]=await Promise.all([
  supabase.from("sales_invoice_items").select("*").eq("invoice_id",id).order("created_at"),
  supabase.from("sales_invoice_payments").select("*").eq("invoice_id",id).order("payment_date",{ascending:false}),
  supabase.rpc("has_permission",{required_permission:"sales.create"})
 ]);
 const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
 const warehouse=Array.isArray(invoice.warehouses)?invoice.warehouses[0]:invoice.warehouses;
 const balance=Number(invoice.subtotal)-Number(invoice.paid_amount);
 return <div className="min-h-screen bg-slate-100 md:flex print:bg-white"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-5xl space-y-5">
 <div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href="/sales/invoices" className="text-sm font-semibold text-blue-700">← Daftar Invoice</Link><InvoicePrintButton/></div>
 {notice.error&&<p className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">Aksi gagal ({notice.error}).</p>}{notice.created&&<p className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-emerald-700">Invoice diterbitkan.</p>}{notice.paid&&<p className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-emerald-700">Pembayaran dicatat.</p>}
 <article className="border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
  <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-900 pb-6"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">HEXA CORE</p><h1 className="mt-2 text-3xl font-black tracking-wide">INVOICE</h1><p className="mt-1 text-sm text-slate-500">Dokumen penagihan penjualan</p></div><div className="text-right"><p className="text-sm text-slate-500">Nomor Invoice</p><p className="text-xl font-bold">{invoice.invoice_number}</p><p className="mt-2 text-sm">Tanggal: {invoice.invoice_date}</p><p className="text-sm">Jatuh tempo: {invoice.due_date??"—"}</p><p className="mt-2 text-sm font-semibold">{status[invoice.status]??invoice.status}</p></div></div>
  <div className="grid gap-6 py-6 sm:grid-cols-2"><div><p className="mb-2 text-xs font-bold uppercase text-slate-500">Ditagihkan kepada</p><p className="font-bold">{customer?.customer_name??"—"}</p><p className="text-sm">{customer?.customer_code??""}</p><p className="whitespace-pre-line text-sm text-slate-600">{customer?.address??""}</p><p className="text-sm text-slate-600">{customer?.phone??""}</p><p className="text-sm text-slate-600">NPWP: {customer?.tax_number??"—"}</p></div><div><p className="mb-2 text-xs font-bold uppercase text-slate-500">Informasi Pengiriman</p><p className="text-sm">Warehouse: {warehouse?.warehouse_name??"—"}</p><p className="text-sm">Sumber: Delivery Order</p><p className="text-sm">Catatan: {invoice.notes??"—"}</p></div></div>
  {linesError?<p className="text-sm text-red-700">Rincian invoice gagal dimuat.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y bg-slate-50"><tr><th className="p-3">Produk</th><th className="p-3">SKU</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Harga</th><th className="p-3 text-right">Jumlah</th></tr></thead><tbody className="divide-y">{(lines??[]).map((line:any)=><tr key={line.id}><td className="p-3"><p className="font-medium">{line.product_name_snapshot}</p><p className="text-xs text-slate-500">{line.variant_name_snapshot}</p></td><td className="p-3">{line.variant_sku_snapshot}</td><td className="p-3 text-right">{line.quantity} Unit</td><td className="p-3 text-right">{money(line.unit_price)}</td><td className="p-3 text-right">{money(line.line_total)}</td></tr>)}</tbody></table></div>}
  <div className="ml-auto mt-6 max-w-sm space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div><div className="flex justify-between"><span>Sudah dibayar</span><strong>{money(invoice.paid_amount)}</strong></div><div className="flex justify-between border-t pt-3 text-base"><span>Sisa tagihan</span><strong>{money(balance)}</strong></div></div>
  <div className="mt-12 grid grid-cols-2 gap-8 text-center text-sm"><div><p>Disiapkan oleh,</p><div className="h-20"/><p className="border-t pt-2">HEXA CORE</p></div><div><p>Diterima oleh,</p><div className="h-20"/><p className="border-t pt-2">Pelanggan</p></div></div>
 </article>
 <section className="rounded-xl border bg-white p-5 print:hidden"><h2 className="font-semibold">Riwayat Pembayaran</h2>{paymentsError?<p className="mt-3 text-sm text-red-700">Riwayat pembayaran gagal dimuat.</p>:!payments?.length?<p className="mt-3 text-sm text-slate-500">Belum ada pembayaran.</p>:<div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Nomor</th><th className="p-2">Tanggal</th><th className="p-2">Metode</th><th className="p-2">Referensi</th><th className="p-2 text-right">Nominal</th></tr></thead><tbody>{payments.map((p:any)=><tr key={p.id} className="border-b"><td className="p-2">{p.payment_number}</td><td className="p-2">{p.payment_date}</td><td className="p-2">{p.payment_method}</td><td className="p-2">{p.reference_number??"—"}</td><td className="p-2 text-right">{money(p.amount)}</td></tr>)}</tbody></table></div>}
 {canPay.data===true&&invoice.status!=="void"&&balance>0&&<form action={recordInvoicePaymentAction} className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"><input type="hidden" name="invoice_id" value={id}/><label className="text-sm">Tanggal<input type="date" name="payment_date" defaultValue={new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"})} required className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm">Nominal<input type="number" name="amount" min="1" max={balance} step="0.01" required className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm">Metode<select name="payment_method" className="mt-1 w-full rounded-lg border px-3 py-2"><option value="cash">Tunai</option><option value="bank_transfer">Transfer Bank</option><option value="card">Kartu</option><option value="other">Lainnya</option></select></label><label className="text-sm">Nomor Referensi<input name="reference_number" maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm sm:col-span-2">Catatan<input name="notes" maxLength={2000} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><div className="sm:col-span-2"><button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Catat Pembayaran</button></div></form>}
 </section>
 </div></main></div>;
}
