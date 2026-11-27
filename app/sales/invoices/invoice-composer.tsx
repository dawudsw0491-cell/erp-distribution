"use client";

import {useMemo,useState} from "react";
import {createInvoiceAction} from "./actions";

type InvoiceLine={id:string;product_name:string;variant_sku:string;variant_name:string;delivered:number;already_invoiced:number;unit_price:number};
type Scheme="cash"|"bank_transfer"|"credit";
const label:Record<Scheme,string>={cash:"Cash / Tunai",bank_transfer:"Transfer Bank",credit:"Kredit / Termin"};
export default function InvoiceComposer({deliveryOrderId,lines,paymentScheme,paymentDueDate}:{deliveryOrderId:string;lines:InvoiceLine[];paymentScheme:Scheme;paymentDueDate:string|null}) {
 const [quantities,setQuantities]=useState<Record<string,string>>(()=>Object.fromEntries(lines.map(line=>[line.id,String(Math.max(0,line.delivered-line.already_invoiced))])));
 const [confirmReceived,setConfirmReceived]=useState(false);
 const [initialAmount,setInitialAmount]=useState("0");
 const [creditMethod,setCreditMethod]=useState("cash");
 const items=lines.map(line=>({delivery_order_item_id:line.id,quantity:quantities[line.id]??"0"})).filter(item=>Number(item.quantity)>0);
 const total=useMemo(()=>lines.reduce((sum,line)=>sum+Number(quantities[line.id]??0)*line.unit_price,0),[lines,quantities]);
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"});
 const receivedAmount=paymentScheme==="credit"?Number(initialAmount||0):(confirmReceived?total:0);
 const method=paymentScheme==="credit"?creditMethod:paymentScheme;
 const validPayment=Number.isFinite(receivedAmount)&&receivedAmount>=0&&receivedAmount<=total&&((receivedAmount===0)||(paymentScheme!=="bank_transfer"||true));
 return <form action={createInvoiceAction} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
  <input type="hidden" name="delivery_order_id" value={deliveryOrderId}/>
  <input type="hidden" name="items" value={JSON.stringify(items)}/>
  <input type="hidden" name="initial_payment_amount" value={String(receivedAmount)}/>
  <input type="hidden" name="payment_method" value={method}/>
  <input type="hidden" name="payment_date" value={today}/>
  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Skema Pembayaran dari Sales Order</p><p className="mt-1 font-semibold text-slate-900">{label[paymentScheme]}</p><p className="mt-1 text-xs text-slate-600">{paymentScheme==="credit"?`Jatuh tempo termin: ${paymentDueDate??"Belum ditentukan"}`:"Pembayaran langsung. Invoice baru dianggap lunas setelah penerimaan uang dikonfirmasi dan dicatat."}</p></div>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="text-sm font-medium">Tanggal Invoice<input name="invoice_date" type="date" defaultValue={today} required className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
   {paymentScheme==="credit"?<label className="text-sm font-medium">Jatuh Tempo<input name="due_date" type="date" min={today} defaultValue={paymentDueDate??""} required className="mt-1 w-full rounded-lg border px-3 py-2"/></label>:<div className="text-sm"><p className="font-medium">Jatuh Tempo</p><p className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 text-slate-600">Hari yang sama dengan invoice</p></div>}
  </div>
  <div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-700"><thead className="bg-slate-50"><tr><th className="p-3 align-middle">Produk / Variant</th><th className="p-3 align-middle">Terkirim</th><th className="p-3 align-middle">Belum ditagih</th><th className="p-3 align-middle">Harga</th><th className="p-3 align-middle">Kuantitas Invoice</th></tr></thead><tbody className="divide-y divide-slate-100">{lines.map(line=>{const remaining=Math.max(0,line.delivered-line.already_invoiced);return <tr key={line.id}><td className="p-3"><div className="font-medium">{line.product_name}</div><div className="text-xs text-slate-500">{line.variant_sku} · {line.variant_name}</div></td><td className="p-3">{line.delivered}</td><td className="p-3">{remaining}</td><td className="p-3">{line.unit_price.toLocaleString("id-ID")}</td><td className="p-3"><input aria-label={`Kuantitas invoice ${line.product_name}`} type="number" min="0" max={remaining} step="0.001" value={quantities[line.id]??"0"} onChange={e=>setQuantities(old=>({...old,[line.id]:e.target.value}))} className="w-28 rounded-lg border px-2 py-1.5"/></td></tr>})}</tbody></table></div>
  <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Pencatatan Pembayaran</h3>
   {paymentScheme==="credit"?<><p className="text-xs text-slate-500">Opsional: masukkan uang muka jika pelanggan membayar sebagian saat invoice diterbitkan. Kosongkan atau isi 0 jika belum ada pembayaran.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Pembayaran diterima<input type="number" name="initial_amount_display" min="0" max={total} step="0.01" value={initialAmount} onChange={e=>setInitialAmount(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm">Metode pembayaran<select value={creditMethod} onChange={e=>setCreditMethod(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="cash">Tunai</option><option value="bank_transfer">Transfer Bank</option></select></label></div></>:<><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmReceived} onChange={e=>setConfirmReceived(e.target.checked)} className="mt-1 h-4 w-4"/><span><strong>Pembayaran {label[paymentScheme]} sudah diterima.</strong><span className="block text-xs text-slate-500">Jika dicentang, sistem mencatat pembayaran sebesar total invoice secara otomatis. Jika belum diterima, invoice tetap memiliki saldo yang harus ditagihkan.</span></span></label>{paymentScheme==="bank_transfer"&&<label className="block text-sm">Nomor Referensi Transfer<input name="reference_number" maxLength={120} placeholder="Nomor transaksi / bukti transfer" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>}</>}
   {paymentScheme==="credit"&&<label className="block text-sm">Nomor Referensi (jika transfer)<input name="reference_number" maxLength={120} placeholder="Opsional" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>}
   <label className="block text-sm">Catatan Pembayaran<input name="payment_notes" maxLength={2000} placeholder="Opsional" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
  </section>
  <label className="block text-sm font-medium">Catatan Invoice<textarea name="notes" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-xs text-slate-500">Estimasi invoice</p><p className="text-xl font-bold">Rp {Math.round(total).toLocaleString("id-ID")}</p><p className="text-xs text-slate-500">Pembayaran awal: Rp {Math.round(receivedAmount).toLocaleString("id-ID")} · Sisa: Rp {Math.max(0,Math.round(total-receivedAmount)).toLocaleString("id-ID")}</p></div><button disabled={!items.length||!validPayment} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Terbitkan Invoice</button></div>
 </form>;
}
