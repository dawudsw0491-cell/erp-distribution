"use client";

export default function InvoicePrintButton() {
  return <button type="button" onClick={()=>window.print()} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Cetak / Simpan PDF</button>;
}
