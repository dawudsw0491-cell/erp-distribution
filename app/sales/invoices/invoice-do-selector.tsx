"use client";

import { useState } from "react";

export default function InvoiceDoSelector({orders,selectedId}:{orders:{id:string;delivery_order_number:string;delivery_date:string;customer_name:string}[];selectedId:string}) {
  const [loading,setLoading]=useState(false);
  return <form method="get" onSubmit={()=>setLoading(true)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <label className="block text-sm font-medium">Delivery Order
      <select name="delivery_order_id" defaultValue={selectedId} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
        <option value="">Pilih Delivery Order</option>
        {orders.map(order=><option key={order.id} value={order.id}>{order.delivery_order_number} · {order.delivery_date} · {order.customer_name}</option>)}
      </select>
    </label>
    <button type="submit" disabled={loading} className="mt-3 inline-flex min-w-40 items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-70">
      {loading&&<span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/>}
      {loading?"Memuat detail DO…":"Muat Detail DO"}
    </button>
    {loading&&<p role="status" className="mt-2 text-xs text-blue-700">Mengambil informasi DO, detail barang, dan histori invoice.</p>}
  </form>;
}
