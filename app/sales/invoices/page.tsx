import Link from "next/link";
import {redirect} from "next/navigation";
import {connection} from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import {getAuthorizationContext} from "@/lib/auth/authorization";

export const metadata={title:"Invoice Penjualan | HEXA CORE ERP"};
const money=(v:number|string)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v??0));
const labels:Record<string,string>={issued:"Belum lunas",partially_paid:"Dibayar sebagian",paid:"Lunas",void:"Void"};
export default async function InvoiceListPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
 await connection();
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.view");
 if(!user) redirect("/login");
 if(!profile||!authorized) return <div className="p-8">Akses invoice ditolak.</div>;
 const params=await searchParams;
 const {data,error}=await supabase.from("sales_invoices").select("id,invoice_number,invoice_date,due_date,status,subtotal,paid_amount,customers(customer_name)").order("invoice_date",{ascending:false}).limit(100);
 return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/sales" className="text-sm font-semibold text-blue-700">← Penjualan</Link><h1 className="mt-2 text-2xl font-bold">Invoice Penjualan</h1><p className="mt-1 text-sm text-slate-500">Invoice berasal dari Delivery Order yang sudah diposting.</p></div><Link href="/sales/invoices/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Buat Invoice</Link></div>
 {params.error&&<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Permintaan gagal ({params.error}).</p>}
 <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4 font-semibold">Daftar Invoice <span className="font-normal text-slate-500">· 100 terbaru</span></div>{error?<p className="p-6 text-sm text-red-700">Invoice gagal dimuat. Pastikan migrasi dan akses Data API tersedia.</p>:!data?.length?<div className="p-12 text-center text-sm text-slate-500">Belum ada invoice.</div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Nomor</th><th className="p-3">Pelanggan</th><th className="p-3">Tanggal</th><th className="p-3">Jatuh Tempo</th><th className="p-3">Nilai</th><th className="p-3">Dibayar</th><th className="p-3">Sisa</th><th className="p-3">Status</th><th/></tr></thead><tbody className="divide-y">{data.map((row:any)=><tr key={row.id}><td className="p-3 font-semibold">{row.invoice_number}</td><td className="p-3">{(Array.isArray(row.customers)?row.customers[0]:row.customers)?.customer_name??"—"}</td><td className="p-3">{row.invoice_date}</td><td className="p-3">{row.due_date??"—"}</td><td className="p-3">{money(row.subtotal)}</td><td className="p-3">{money(row.paid_amount)}</td><td className="p-3 font-semibold">{money(Number(row.subtotal)-Number(row.paid_amount))}</td><td className="p-3">{labels[row.status]??row.status}</td><td className="p-3"><Link className="font-semibold text-blue-700" href={`/sales/invoices/${row.id}`}>Detail</Link></td></tr>)}</tbody></table></div>}</section>
 </div></main></div>;
}
