import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata={title:"Penjualan | HEXA CORE ERP",description:"Pengelolaan Sales Order dan Delivery Order"};

const labels:Record<string,string>={draft:"Draft",confirmed:"Dikonfirmasi",partially_delivered:"Terkirim Sebagian",delivered:"Selesai",cancelled:"Dibatalkan"};
const money=(v:number|string|null)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v??0));
const date=(v:string)=>new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v));

export default async function SalesPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string;error?:string}>}) {
  await connection();
  const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.view");
  if(!user) redirect("/login");
  if(!profile||!authorized) return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/sales"/><main className="p-8">Akses penjualan ditolak.</main></div>;
  const params=await searchParams, q=(params.q??"").trim().replace(/[,%()]/g,"").slice(0,80);
  const pageSize=50, requestedPage=Number.parseInt(params.page??"1",10);
  const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
  const allowed=["draft","confirmed","partially_delivered","delivered","cancelled"];
  const status=allowed.includes(params.status??"")?params.status:"";
  let query=supabase.from("sales_orders").select("id,sales_order_number,order_date,status,subtotal,created_at,customers(customer_code,customer_name),warehouses(warehouse_code,warehouse_name)",{count:"exact"}).order("created_at",{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  if(q) query=query.ilike("sales_order_number",`%${q}%`);
  if(status) query=query.eq("status",status);
  const [{data,error,count},createPermission]=await Promise.all([query,supabase.rpc("has_permission",{required_permission:"sales.create"})]);
  return <div className="min-h-screen bg-slate-100 md:flex md:h-screen md:overflow-hidden"><ErpSidebar activePath="/sales"/><main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    {params.error&&<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Permintaan tidak dapat diproses ({params.error}). Periksa hak akses dan status transaksi.</p>}
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Penjualan</h1><p className="mt-1 text-sm text-slate-600">Sales Order dan proses pengiriman dalam satu modul.</p></div>{createPermission.data===true&&<Link href="/sales/new" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">+ Buat Penjualan</Link>}</header>
    <form className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4"><input name="q" defaultValue={q} placeholder="Cari nomor SO..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"/><select name="status" defaultValue={status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Semua Status</option>{allowed.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Filter</button></form>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Daftar Penjualan</h2><p className="mt-1 text-xs text-slate-500">{count??0} Sales Order · menampilkan maksimal {pageSize} per halaman</p></div>{error?<p className="p-6 text-sm text-red-700">Data penjualan gagal dimuat. Periksa permission dan migrasi database.</p>:!data?.length?<div className="p-12 text-center"><p className="font-semibold">Belum ada transaksi penjualan</p><p className="mt-1 text-sm text-slate-500">Buat transaksi penjualan pertama.</p></div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-5 py-3">Nomor SO</th><th className="px-5 py-3">Pelanggan</th><th className="px-5 py-3">Warehouse</th><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Nilai</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y">{data.map((row:any)=><tr key={row.id}><td className="px-5 py-3 font-semibold">{row.sales_order_number}</td><td className="px-5 py-3">{(Array.isArray(row.customers)?row.customers[0]:row.customers)?.customer_name??"—"}</td><td className="px-5 py-3">{(Array.isArray(row.warehouses)?row.warehouses[0]:row.warehouses)?.warehouse_name??"—"}</td><td className="px-5 py-3">{date(row.order_date)}</td><td className="px-5 py-3">{money(row.subtotal)}</td><td className="px-5 py-3">{labels[row.status]??row.status}</td><td className="px-5 py-3"><Link className="font-semibold text-blue-700 hover:underline" href={`/sales/${row.id}`}>Detail</Link></td></tr>)}</tbody></table></div>}{!error&&(count??0)>pageSize&&<div className="flex items-center justify-between border-t px-5 py-3 text-sm"><span className="text-slate-500">Halaman {page} dari {Math.ceil((count??0)/pageSize)}</span><div className="flex gap-2">{page>1&&<Link className="rounded-lg border px-3 py-2" href={`/sales?${new URLSearchParams({...(q?{q}:{}),...(status?{status}:{}),page:String(page-1)}).toString()}`}>Sebelumnya</Link>}{page<Math.ceil((count??0)/pageSize)&&<Link className="rounded-lg border px-3 py-2" href={`/sales?${new URLSearchParams({...(q?{q}:{}),...(status?{status}:{}),page:String(page+1)}).toString()}`}>Berikutnya</Link>}</div></div>}</section>
  </div></main></div>;
}
