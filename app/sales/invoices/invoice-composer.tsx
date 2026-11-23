"use client";

import { useMemo, useState } from "react";
import { createInvoiceAction } from "./actions";

type InvoiceLine = { id: string; product_name: string; variant_sku: string; variant_name: string; delivered: number; already_invoiced: number; unit_price: number };
export default function InvoiceComposer({deliveryOrderId,lines}:{deliveryOrderId:string;lines:InvoiceLine[]}) {
  const [quantities,setQuantities]=useState<Record<string,string>>(()=>Object.fromEntries(lines.map(line=>[line.id,String(Math.max(0,line.delivered-line.already_invoiced))])));
  const selected=useMemo(()=>lines.map(line=>({delivery_order_item_id:line.id,quantity:quantities[line.id]??"0"}).filter?null:null),[lines,quantities]);
  const items=lines.map(line=>({delivery_order_item_id:line.id,quantity:quantities[line.id]??"0"})).filter(item=>Number(item.quantity)>0);
  const total=lines.reduce((sum,line)=>sum+Number(quantities[line.id]??0)*line.unit_price,0);
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"});
  return <form action={createInvoiceAction} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
    <input type="hidden" name="delivery_order_id" value={deliveryOrderId}/>
    <input type="hidden" name="items" value={JSON.stringify(items)}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Tanggal Invoice<input name="invoice_date" type="date" defaultValue={today} required className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="text-sm font-medium">Jatuh Tempo<input name="due_date" type="date" min={today} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Produk / Variant</th><th className="p-3">Terkirim</th><th className="p-3">Belum ditagih</th><th className="p-3">Harga</th><th className="p-3">Tagih</th></tr></thead><tbody className="divide-y">{lines.map(line=>{const remaining=Math.max(0,line.delivered-line.already_invoiced);return <tr key={line.id}><td className="p-3"><div className="font-medium">{line.product_name}</div><div className="text-xs text-slate-500">{line.variant_sku} · {line.variant_name}</div></td><td className="p-3">{line.delivered}</td><td className="p-3">{remaining}</td><td className="p-3">{line.unit_price.toLocaleString("id-ID")}</td><td className="p-3"><input aria-label={`Kuantitas tagih ${line.product_name}`} type="number" min="0" max={remaining} step="0.001" value={quantities[line.id]??"0"} onChange={e=>setQuantities(old=>({...old,[line.id]:e.target.value}))} className="w-28 rounded-lg border px-2 py-1.5"/></td></tr>})}</tbody></table></div>
    <label className="block text-sm font-medium">Catatan<textarea name="notes" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-xs text-slate-500">Estimasi nilai invoice</p><p className="text-xl font-bold">Rp {Math.round(total).toLocaleString("id-ID")}</p></div><button disabled={!items.length} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Terbitkan Invoice</button></div>
  </form>;
}
