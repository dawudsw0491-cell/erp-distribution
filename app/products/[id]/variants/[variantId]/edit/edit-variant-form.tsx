"use client";
import Link from "next/link";
import { useState } from "react";
import { updateProductVariant } from "@/app/products/actions";
type Props={productId:string;variantId:string;variantSku:string;initialVariantName:string;initialBarcode:string;initialSpecifications:Record<string,string>;specificationOptions:Record<string,string[]>};
const input="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const label="mb-1.5 block text-sm font-medium text-slate-700";
export default function EditVariantForm({productId,variantId,variantSku,initialVariantName,initialBarcode,initialSpecifications,specificationOptions}:Props){
 const parts=initialVariantName.split("/").map(x=>x.trim());
 const [network,setNetwork]=useState(["4G","5G","WIFI ONLY"].includes((parts[0]??"").toUpperCase())?(parts[0]??"").toUpperCase():"");
 const [barcode,setBarcode]=useState(initialBarcode);
 const [specs,setSpecs]=useState(initialSpecifications);
 const fields=[{code:"RAM",label:"RAM",placeholder:"Contoh: 8 GB"},{code:"ROM",label:"ROM / Penyimpanan",placeholder:"Contoh: 256 GB"},{code:"COLOR",label:"Warna",placeholder:"Contoh: Graphite"},{code:"WARRANTY",label:"Jenis Garansi",placeholder:"Pilih atau ketik garansi"}] as const;
 return <form action={updateProductVariant} className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
  <input type="hidden" name="product_id" value={productId}/><input type="hidden" name="variant_id" value={variantId}/>
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-semibold text-blue-900">SKU Varian</p><p className="mt-1 font-mono text-sm text-blue-800">{variantSku}</p><p className="mt-1 text-xs text-blue-800">SKU tetap dan tidak berubah saat varian diedit.</p></div>
  <section className="space-y-4"><div className="border-b border-slate-200 pb-2"><h2 className="font-semibold text-slate-800">Varian, SKU, Spesifikasi & Garansi</h2><p className="mt-1 text-xs text-slate-500">Struktur field sama dengan Product Master.</p></div>
   <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <div><label className={label}>Network <span className="text-red-600">*</span></label><select name="network" required value={network} onChange={e=>setNetwork(e.target.value)} className={input}><option value="">Pilih Network</option><option value="4G">4G</option><option value="5G">5G</option><option value="WIFI ONLY">WIFI ONLY</option></select></div>
    <div><label className={label}>Barcode</label><input name="barcode" maxLength={100} value={barcode} onChange={e=>setBarcode(e.target.value)} className={input} placeholder="Barcode (opsional)"/></div>
    {fields.map(f=><div key={f.code}><label className={label}>{f.label}</label><input name={`spec_${f.code}`} maxLength={100} list={`edit-options-${f.code.toLowerCase()}`} value={specs[f.code]??""} onChange={e=>setSpecs(p=>({...p,[f.code]:e.target.value}))} className={input} placeholder={f.placeholder}/><datalist id={`edit-options-${f.code.toLowerCase()}`}>{(specificationOptions[f.code]??[]).map(v=><option key={v} value={v}/>)}</datalist></div>)}
   </div>
  </section>
  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><Link href={`/products/${productId}/variants/${variantId}`} className="rounded-lg border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</Link><button type="submit" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Simpan Perubahan</button></div>
 </form>;
}
