import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { approveReturnAction, postReturnAction } from "../actions";

export const metadata = { title: "Detail Retur | HEXA CORE ERP" };
const labels:Record<string,string>={draft:"Draft",approved:"Menunggu Posting",posted:"Selesai",cancelled:"Dibatalkan"};
const money=(value:number|string)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value??0));

export default async function ReturnDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;created?:string;approved?:string;posted?:string}>}) {
  await connection();
  const {id}=await params, notice=await searchParams;
  const {supabase,user,profile}=await getAuthorizationContext("sales.view");
  if(!user) redirect("/login");
  if(!profile) redirect("/returns?error=permission_denied");
  const {data:row,error}=await supabase.from("sales_returns").select("*,customers(customer_code,customer_name),suppliers(supplier_code,supplier_name),warehouses(warehouse_name)").eq("id",id).maybeSingle();
  if(error) return <div className="p-8 text-red-700">Data retur gagal dimuat. Pastikan akses tabel dan Data API tersedia.</div>;
  if(!row) notFound();
  const [{data:lines,error:linesError},canPost,canApproveCustomer,canApproveSupplier]=await Promise.all([
    supabase.from("sales_return_items").select("*").eq("return_id",id).order("created_at"),
    supabase.rpc("has_permission",{required_permission:"finance.approve"}),
    supabase.rpc("has_permission",{required_permission:"sales.return"}),
    supabase.rpc("has_permission",{required_permission:"purchasing.approve"})
  ]);
  const party=row.return_type==="customer"?(Array.isArray(row.customers)?row.customers[0]:row.customers):(Array.isArray(row.suppliers)?row.suppliers[0]:row.suppliers);
  const warehouse=Array.isArray(row.warehouses)?row.warehouses[0]:row.warehouses;
  const canApprove=row.return_type==="customer"?canApproveCustomer.data===true:canApproveSupplier.data===true;
  const canPostReturn=canPost.data===true&&(row.return_type==="customer"?canApproveCustomer.data===true:canApproveSupplier.data===true);
  return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/returns"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/returns" className="text-sm font-semibold text-blue-700">← Daftar Returns</Link><h1 className="mt-2 text-2xl font-bold">{row.return_number}</h1><p className="mt-1 text-sm text-slate-500">{row.return_type==="customer"?"Customer Return":"Supplier Return"} · {labels[row.status]??row.status}</p></div><div className="flex flex-wrap gap-2">
      {row.status==="draft"&&canApprove&&<form action={approveReturnAction}><input type="hidden" name="return_id" value={id}/><button className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">Approve Retur</button></form>}
      {row.status==="approved"&&canPostReturn&&<form action={postReturnAction}><input type="hidden" name="return_id" value={id}/><button className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Posting Inventory</button></form>}
    </div></div>
    {notice.error&&<p className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">Aksi gagal ({notice.error}). Periksa status transaksi, pemisahan tugas, permission, dan warehouse.</p>}
    {notice.created&&<p className="rounded-lg border border-blue-200 bg-white p-3 text-sm text-blue-700">Draft retur berhasil dibuat. Stok belum berubah.</p>}
    {notice.approved&&<p className="rounded-lg border border-blue-200 bg-white p-3 text-sm text-blue-700">Retur telah disetujui. Menunggu aktor posting yang berbeda.</p>}
    {notice.posted&&<p className="rounded-lg border border-blue-200 bg-white p-3 text-sm text-blue-700">Retur berhasil diposting ke inventory.</p>}
    <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-xs text-slate-500">Pihak</p><p className="mt-1 font-semibold">{party?.customer_name??party?.supplier_name??"—"}</p><p className="text-xs text-slate-500">{party?.customer_code??party?.supplier_code??""}</p></div>
      <div><p className="text-xs text-slate-500">Warehouse</p><p className="mt-1 font-semibold">{warehouse?.warehouse_name??"—"}</p></div>
      <div><p className="text-xs text-slate-500">Tanggal Retur</p><p className="mt-1 font-semibold">{row.return_date}</p></div>
      <div><p className="text-xs text-slate-500">Dokumen Sumber</p><p className="mt-1 font-semibold">{row.return_type==="customer"?"Delivery Order":"Goods Receipt"}</p></div>
      <div className="sm:col-span-2"><p className="text-xs text-slate-500">Alasan</p><p className="mt-1 font-medium">{row.reason}</p></div>
      <div className="sm:col-span-2"><p className="text-xs text-slate-500">Catatan</p><p className="mt-1">{row.notes??"—"}</p></div>
      <div><p className="text-xs text-slate-500">Dibuat</p><p className="mt-1 text-sm">{row.created_at}</p></div>
      <div><p className="text-xs text-slate-500">Disetujui</p><p className="mt-1 text-sm">{row.approved_at??"—"}</p></div>
      <div><p className="text-xs text-slate-500">Diposting</p><p className="mt-1 text-sm">{row.posted_at??"—"}</p></div>
    </section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Rincian Barang</h2><p className="mt-1 text-xs text-slate-500">Snapshot produk dari dokumen sumber; stok berubah hanya pada status posted.</p></div>
      {linesError?<p className="p-5 text-sm text-red-700">Detail baris retur gagal dimuat.</p>:!lines?.length?<p className="p-8 text-sm text-slate-500">Tidak ada baris retur.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Produk</th><th className="p-3">SKU</th><th className="p-3 text-right">Qty</th><th className="p-3">Bucket</th><th className="p-3">Product Unit</th><th className="p-3">Inventory Movement</th></tr></thead><tbody className="divide-y">{lines.map((line:any)=><tr key={line.id}><td className="p-3 font-medium">{line.product_name_snapshot}<p className="text-xs text-slate-500">{line.variant_name_snapshot}</p></td><td className="p-3">{line.variant_sku_snapshot}</td><td className="p-3 text-right">{line.quantity} Unit</td><td className="p-3">{line.inventory_status}</td><td className="p-3 font-mono text-xs">{line.product_unit_id??"Agregat SKU"}</td><td className="p-3 font-mono text-xs">{line.inventory_movement_id??"Belum diposting"}</td></tr>)}</tbody></table></div>}
    </section>
    {row.status==="approved"&&<p className="text-xs text-slate-500">Pemisahan tugas aktif: pembuat dan approver berbeda; poster juga harus berbeda dari approver serta memiliki permission finance.approve dan permission modul terkait.</p>}
  </div></main></div>;
}
