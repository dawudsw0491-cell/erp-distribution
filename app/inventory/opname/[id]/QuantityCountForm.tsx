
"use client";

import { useState } from "react";
import { recordStockOpnameCountAction } from "../actions";

type Props = {
  sessionId: string;
  itemId: string;
  countedQuantity: number | null;
  notes: string;
  unit: string;
};

export default function QuantityCountForm({
  sessionId,
  itemId,
  countedQuantity,
  notes,
  unit,
}: Props) {
  const [quantity, setQuantity] = useState(
    countedQuantity === null ? "" : String(countedQuantity)
  );
  const [note, setNote] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setMessage("");

    const formData = new FormData();
    formData.set("session_id", sessionId);
    formData.set("item_id", itemId);
    formData.set("counted_quantity", quantity);
    formData.set("notes", note);

    try {
      const result = await recordStockOpnameCountAction(formData);

      setSuccess(result.success);
      setMessage(result.message);
    } catch {
      setSuccess(false);
      setMessage("Terjadi kesalahan koneksi. Silakan coba kembali.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Hasil Penghitungan Fisik
        </label>
        <input
          name="counted_quantity"
          type="number"
          min="0"
          max="999999999999999"
          step="0.001"
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="Masukkan quantity fisik"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Satuan: {unit || "-"}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Catatan Penghitungan
        </label>
        <input
          name="notes"
          type="text"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Keterangan hasil penghitungan..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Hasil Hitung"}
        </button>

        {message && (
          <span
            className={`text-sm ${
              success ? "text-green-600" : "text-red-600"
            }`}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
