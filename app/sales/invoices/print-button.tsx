"use client";

export default function InvoicePrintButton({invoiceId}:{invoiceId:string}) {
  return <div className="flex flex-wrap items-center gap-2">
    <a href={`/sales/invoices/${invoiceId}/pdf`} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>
      Download PDF
    </a>
    <button type="button" onClick={()=>window.print()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cetak Invoice</button>
  </div>;
}
