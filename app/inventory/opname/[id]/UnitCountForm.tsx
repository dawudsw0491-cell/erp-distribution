
"use client";

import { useState } from "react";
import { recordStockOpnameUnitCountAction } from "../actions";

type Props = {
  sessionId: string;
  itemId: string;
  productUnitId: string;
  isPresent: boolean;
  observedStatus: string;
  notes: string;
  statusOptions: { value: string; label: string }[];
};

export default function UnitCountForm({
  sessionId,
  itemId,
  productUnitId,
  isPresent,
  observedStatus,
  notes,
  statusOptions,
}: Props) {
  const [present, setPresent] = useState(String(isPresent));
  const [status, setStatus] = useState(observedStatus);
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
    formData.set("product_unit_id", productUnitId);
    formData.set("is_present", present);
    formData.set("observed_status", status);
    formData.set("notes", note);

    try {
      const result = await recordStockOpnameUnitCountAction(formData);

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
      className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Hasil Pemeriksaan
        </label>
        <select
          value={present}
          onChange={(event) => setPresent(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="true">Ditemukan</option>
          <option value="false">Tidak Ditemukan</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Status Fisik
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={present !== "true"}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Catatan Unit
        </label>
        <input
          type="text"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Catatan hasil pemeriksaan..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Hasil Unit"}
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
