import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createProductVariant } from "@/app/products/actions";

export const instant = false;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };
const errorMessages: Record<string,string> = {
  invalid_variants: "Periksa Network, spesifikasi, dan barcode. Network wajib dipilih dan kombinasi Network, RAM, ROM, serta warna tidak boleh duplikat.",
  duplicate: "Kombinasi varian, SKU, atau barcode sudah digunakan.",
  forbidden: "Anda tidak memiliki izin membuat varian.",
  save_failed: "Varian gagal disimpan. Silakan coba kembali.",
};
export default async function NewProductVariantPage({params,searchParams}:PageProps) {
  await connection();
  const {id}=await params; const {error:errorCode}=await searchParams;
  if(!UUID_REGEX.test(id)) notFound();
  const auth=await getAuthorizationContext("master.create");
  if(!auth.user) redirect("/login");
  if(!auth.authorized) redirect(`/products/${id}/variants?error=forbidden`);
  const {data:product,error}=await auth.supabase.from("products").select("id,sku,product_name,product_type,is_active").eq("id",id).maybeSingle();
  if(error||!product) notFound();
  if(!product.is_active||product.product_type!=="goods") redirect(`/products/${id}/variants`);
  const codes=["RAM","ROM","COLOR","WARRANTY"] as const;
  const {data:attributes,error:attributeError}=await auth.supabase.from("product_attributes").select("id,attribute_code").in("attribute_code",[...codes]).eq("is_active",true);
  if(attributeError) throw new Error("Gagal memuat master spesifikasi produk.");
  const ids=(attributes??[]).map(x=>x.id);
  const {data:values,error:valuesError}=ids.length?await auth.supabase.from("product_attribute_values").select("attribute_id,value_name").in("attribute_id",ids).eq("is_active",true).order("value_name"): {data:[],error:null};
  if(valuesError) throw new Error("Gagal memuat template spesifikasi produk.");
  const options=Object.fromEntries(codes.map(code=>{const a=attributes?.find(x=>x.attribute_code===code);return [code,(values??[]).filter(x=>x.attribute_id===a?.id).map(x=>x.value_name)]}));
  const input="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const label="mb-1.5 block text-sm font-medium text-slate-700";
  return <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:overflow-hidden"><ErpSidebar activePath="/products"/><main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:h-screen md:p-6 lg:p-8"><div className="mx-auto w-full max-w-5xl space-y-6">
    <div><Link href={`/products/${id}/variants`} className="text-sm text-blue-600 hover:text-blue-800">← Kembali ke daftar varian</Link><h1 className="mt-3 text-2xl font-bold text-slate-900">Tambah Varian Produk</h1><p className="mt-1 text-sm text-slate-500">Tambahkan varian dengan struktur yang sama seperti form Product Master.</p></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Produk Utama</p><p className="mt-2 font-semibold text-slate-900">{product.product_name}</p><p className="mt-1 text-sm text-slate-500">SKU: {product.sku}</p></div>
    {errorCode&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessages[errorCode]??"Terjadi kesalahan. Periksa kembali data varian."}</div>}
    <form action={createProductVariant} className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <input type="hidden" name="product_id" value={product.id}/>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-semibold text-blue-900">SKU Varian Otomatis</p><p className="mt-1 text-sm text-blue-800">SKU dibuat berdasarkan SKU produk utama dan nomor urut berikutnya. SKU tidak dapat diubah.</p></div>
      <section className="space-y-4"><div className="border-b border-slate-200 pb-2"><h2 className="font-semibold text-slate-800">Varian, SKU, Spesifikasi & Garansi</h2><p className="mt-1 text-xs text-slate-500">Susunan field konsisten dengan form tambah Product Master.</p></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={label}>Network <span className="text-red-600">*</span></label><select required name="network" defaultValue="" className={input}><option value="">Pilih Network</option><option value="4G">4G</option><option value="5G">5G</option><option value="WIFI ONLY">WIFI ONLY</option></select><p className="mt-1 text-xs text-slate-500">Pilih konektivitas produk. RAM, ROM, dan warna tetap diisi terpisah.</p></div>
          <div><label className={label}>Barcode</label><input name="barcode" maxLength={100} className={input} placeholder="Barcode (opsional)"/></div>
          <div><label className={label}>RAM</label><input name="spec_RAM" maxLength={100} list="variant-ram-options" className={input} placeholder="Contoh: 8 GB"/></div>
          <div><label className={label}>ROM / Penyimpanan</label><input name="spec_ROM" maxLength={100} list="variant-rom-options" className={input} placeholder="Contoh: 256 GB"/></div>
          <div><label className={label}>Warna</label><input name="spec_COLOR" maxLength={100} list="variant-color-options" className={input} placeholder="Contoh: Graphite"/></div>
          <div><label className={label}>Jenis Garansi</label><input name="spec_WARRANTY" maxLength={100} list="variant-warranty-options" className={input} placeholder="Pilih atau ketik garansi"/></div>
        </div>
      </section>
      <datalist id="variant-ram-options">{(options.RAM??[]).map(v=><option key={v} value={v}/>)}<option value="2 GB"/><option value="4 GB"/><option value="6 GB"/><option value="8 GB"/><option value="12 GB"/><option value="16 GB"/></datalist>
      <datalist id="variant-rom-options">{(options.ROM??[]).map(v=><option key={v} value={v}/>)}<option value="32 GB"/><option value="64 GB"/><option value="128 GB"/><option value="256 GB"/><option value="512 GB"/><option value="1 TB"/></datalist>
      <datalist id="variant-color-options">{(options.COLOR??[]).map(v=><option key={v} value={v}/>)}<option value="Black"/><option value="White"/><option value="Blue"/><option value="Silver"/><option value="Graphite"/></datalist>
      <datalist id="variant-warranty-options">{(options.WARRANTY??[]).map(v=><option key={v} value={v}/>)}<option value="SEIN"/><option value="TAM"/><option value="DISTRIBUTOR"/><option value="GARANSI TOKO"/><option value="TANPA GARANSI"/></datalist>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><Link href={`/products/${id}/variants`} className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">Batal</Link><button type="submit" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Simpan Varian</button></div>
    </form>
  </div></main></div>;
}
