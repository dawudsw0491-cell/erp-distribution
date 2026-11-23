"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createReturnDraftAction } from "./actions";

type UnitOption = { id: string; unit_code: string };
type SourceLine = {
  id: string;
  product_name: string;
  variant_sku: string;
  variant_name: string;
  tracking_type: "quantity" | "imei" | "serial";
  source_quantity: number;
  inventory_status: string;
  units: UnitOption[];
  suggested_unit_id: string | null;
  has_source_unit?: boolean;
};

export default function ReturnComposer({
  returnType,
  sourceDocumentId,
  sourceLines,
}: {
  returnType: "customer" | "supplier";
  sourceDocumentId: string;
  sourceLines: SourceLine[];
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  const [error, setError] = useState("");

  const payload = useMemo(() => sourceLines.filter((line) => selected[line.id]).map((line) => ({
    source_line_id: line.id,
    quantity: quantities[line.id] || "1",
    ...(units[line.id] ? { product_unit_code: units[line.id] } : {}),
  })), [sourceLines, selected, quantities, units]);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!payload.length) {
      event.preventDefault();
      setError("Pilih minimal satu baris barang.");
      return;
    }
    for (const line of sourceLines.filter((row) => selected[row.id])) {
      const quantity = Number(quantities[line.id] || "1");
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > line.source_quantity) {
        event.preventDefault();
        setError(`Kuantitas ${line.product_name} tidak valid.`);
        return;
      }
      if (line.tracking_type === "serial" && (quantity !== 1 || !(units[line.id] || line.suggested_unit_id))) {
        event.preventDefault();
        setError(`Produk serial ${line.product_name} wajib satu unit.`);
        return;
      }
      if (line.tracking_type !== "quantity" && !Number.isInteger(quantity)) {
        event.preventDefault();
        setError(`Kuantitas IMEI/serial ${line.product_name} harus bulat.`);
        return;
      }
      if ((units[line.id] || line.suggested_unit_id) && quantity !== 1) {
        event.preventDefault();
        setError(`Unit individual ${line.product_name} harus diretur satu unit per baris.`);
        return;
      }
    }
    setError("");
  }

  return (
    <form action={createReturnDraftAction} onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="return_type" value={returnType} />
      <input type="hidden" name="source_document_id" value={sourceDocumentId} />
      <input type="hidden" name="items" value={JSON.stringify(payload.map((item) => {
        const line = sourceLines.find((row) => row.id === item.source_line_id);
        return { ...item, ...(item.product_unit_code ? {} : line?.suggested_unit_id ? { product_unit_id: line.suggested_unit_id } : {}) };
      }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Tanggal Retur<input type="date" name="return_date" required value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="text-sm font-medium">Alasan Retur<input name="reason" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Contoh: unit rusak / salah kirim" /></label>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50"><tr><th className="p-3">Pilih</th><th className="p-3">Produk</th><th className="p-3">Sumber</th><th className="p-3">Kuantitas Retur</th><th className="p-3">Unit / IMEI</th></tr></thead>
          <tbody className="divide-y">{sourceLines.map((line) => (
            <tr key={line.id}>
              <td className="p-3"><input type="checkbox" checked={Boolean(selected[line.id])} onChange={(e) => setSelected((old) => ({ ...old, [line.id]: e.target.checked }))} /></td>
              <td className="p-3"><p className="font-semibold">{line.product_name}</p><p className="text-xs text-slate-500">{line.variant_sku} · {line.variant_name}</p></td>
              <td className="p-3">{line.source_quantity} unit</td>
              <td className="p-3"><input type="number" min="0.001" max={line.source_quantity} step={line.tracking_type === "quantity" ? "0.001" : "1"} value={quantities[line.id] ?? ""} onChange={(e) => setQuantities((old) => ({ ...old, [line.id]: e.target.value }))} disabled={!selected[line.id]} placeholder="0" className="w-28 rounded-lg border px-2 py-1.5 disabled:bg-slate-100" /></td>
              <td className="p-3">{line.units.length ? <select value={units[line.id] ?? line.suggested_unit_id ?? ""} onChange={(e) => setUnits((old) => ({ ...old, [line.id]: e.target.value }))} disabled={!selected[line.id]} className="min-w-36 rounded-lg border px-2 py-1.5 disabled:bg-slate-100"><option value="">Tanpa unit khusus</option>{line.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code}</option>)}</select> : <span className="text-xs text-slate-400">{line.has_source_unit ? "Unit mengikuti DO" : "Agregat SKU"}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <label className="block text-sm font-medium">Catatan<textarea name="notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Simpan Draft Retur</button>
    </form>
  );
}
