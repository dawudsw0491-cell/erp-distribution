import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const metadata = { title: "Returns | HEXA CORE ERP" };
const labels: Record<string,string> = { draft:"Draft", approved:"Menunggu Posting", posted:"Selesai", cancelled:"Dibatalkan" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { supabase, user, profile } = await getAuthorizationContext("sales.view");
  if (!user) redirect("/login");
  if (!profile) return <div className="p-8">Akun tidak aktif atau profil tidak tersedia.</div>;
  const params = await searchParams;
  const [{data: rows,error}, customerCreate, supplierCreate] = await Promise.all([
    supabase.from("sales_returns").select("id,return_number,return_type,return_date,status,reason,customers(customer_name),suppliers(supplier_name),warehouses(warehouse_name)").order("created_at",{ascending:false}).limit(100),
    supabase.rpc("has_permission",{required_permission:"sales.return"}),
    supabase.rpc("has_permission",{required_permission:"purchasing.create"})
  ]);
  const canCreate = customerCreate.data === true || supplierCreate.data === true;
  return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/returns"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Returns</h1><p className="mt-1 text-sm text-slate-600">Satu workspace untuk retur pelanggan dan retur supplier. Stok hanya berubah saat retur diposting.</p></div>{canCreate&&<Link href="/returns/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">+ Buat Retur</Link>}</header>
    {params.error&&<p className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">Permintaan gagal ({params.error}).</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Daftar Retur</h2><p className="mt-1 text-xs text-slate-500">100 transaksi terbaru · customer dan supplier</p></div>
    {error?<p className="p-6 text-sm text-red-700">Data retur gagal dimuat. Pastikan migration sudah diterapkan pada environment dan tabel tersedia di Data API.</p>:!rows?.length?<div className="p-12 text-center"><p className="font-semibold">Belum ada transaksi retur</p><p className="mt-1 text-sm text-slate-500">Retur dibuat dari Delivery Order atau Goods Receipt yang sudah diposting.</p></div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Nomor</th><th className="p-3">Jenis</th><th className="p-3">Pihak</th><th className="p-3">Warehouse</th><th className="p-3">Tanggal</th><th className="p-3">Alasan</th><th className="p-3">Status</th><th/></tr></thead><tbody className="divide-y">{rows.map((row:any)=>{const party=row.return_type==="customer"?(Array.isArray(row.customers)?row.customers[0]:row.customers)?.customer_name:(Array.isArray(row.suppliers)?row.suppliers[0]:row.suppliers)?.supplier_name;const warehouse=Array.isArray(row.warehouses)?row.warehouses[0]:row.warehouses;return <tr key={row.id}><td className="p-3 font-semibold">{row.return_number}</td><td className="p-3">{row.return_type==="customer"?"Customer Return":"Supplier Return"}</td><td className="p-3">{party??"—"}</td><td className="p-3">{warehouse?.warehouse_name??"—"}</td><td className="p-3">{row.return_date}</td><td className="p-3">{row.reason}</td><td className="p-3">{labels[row.status]??row.status}</td><td className="p-3"><Link className="font-semibold text-blue-700" href={`/returns/${row.id}`}>Detail</Link></td></tr>})}</tbody></table></div>}
    </section>
  </div></main></div>;
}
