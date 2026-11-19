
"use client";

import { useCallback, useMemo, useState } from "react";
import UniversalScanner from "@/components/scanner/universal-scanner";
import { recordStockOpnameUnitCountAction } from "../actions";

type Identifier = {
  identifier_type: string;
  identifier_value: string;
};

type ScanUnit = {
  itemId: string;
  productUnitId: string;
  unitCode: string;
  productName: string;
  observedStatus: string;
  identifiers: Identifier[];
  alreadyCounted: boolean;
};

type Props = {
  sessionId: string;
  units: ScanUnit[];
};

export default function BulkUnitScanner({
  sessionId,
  units,
}: Props) {
  const [processed, setProcessed] = useState<Set<string>>(
    () =>
      new Set(
        units
          .filter((unit) => unit.alreadyCounted)
          .map((unit) => unit.productUnitId)
      )
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);

  const identifierMap = useMemo(() => {
    const map = new Map<string, ScanUnit>();

    for (const unit of units) {
      for (const identifier of unit.identifiers) {
        const value = identifier.identifier_value
          .trim()
          .toUpperCase();

        if (value && !map.has(value)) {
          map.set(value, unit);
        }
      }

      const unitCode = unit.unitCode.trim().toUpperCase();

      if (unitCode && !map.has(unitCode)) {
        map.set(unitCode, unit);
      }
    }

    return map;
  }, [units]);

  const handleScan = useCallback(
    async (rawValue: string) => {
      if (saving) return;

      const value = rawValue.trim().toUpperCase();

      const unit = identifierMap.get(value);

      if (!unit) {
        setSuccess(false);
        setMessage(`IMEI/Serial tidak terdaftar: ${value}`);
        return;
      }

      if (processed.has(unit.productUnitId)) {
        setSuccess(false);
        setMessage(
          `Unit ${unit.unitCode} sudah tercatat dalam sesi ini.`
        );
        return;
      }

      setSaving(true);
      setMessage(`Menyimpan ${unit.unitCode}...`);

      const formData = new FormData();

      formData.set("session_id", sessionId);
      formData.set("item_id", unit.itemId);
      formData.set("product_unit_id", unit.productUnitId);
      formData.set("is_present", "true");
      formData.set("observed_status", unit.observedStatus);
      formData.set("notes", "Diverifikasi melalui Bulk IMEI Scanner");

      try {
        const result =
          await recordStockOpnameUnitCountAction(formData);

        setSuccess(result.success);
        setMessage(
          result.success
            ? `Berhasil: ${unit.productName} - ${unit.unitCode}`
            : result.message
        );

        if (result.success) {
          setProcessed((previous) => {
            const next = new Set(previous);
            next.add(unit.productUnitId);
            return next;
          });

          setScanLog((previous) =>
            [
              `${unit.unitCode} - ${unit.productName}`,
              ...previous,
            ].slice(0, 20)
          );
        }
      } catch {
        setSuccess(false);
        setMessage("Gagal menyimpan hasil scan. Silakan ulangi.");
      } finally {
        setSaving(false);
      }
    },
    [identifierMap, processed, saving, sessionId]
  );

  const total = units.length;
  const completed = units.filter((unit) =>
    processed.has(unit.productUnitId)
  ).length;

  return (
    <section className="space-y-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          Bulk IMEI / Serial Scanner
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Scan unit secara berurutan menggunakan satu kamera.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-xs text-blue-700">Unit Terdaftar</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">
            {total}
          </p>
        </div>

        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-xs text-emerald-700">
            Unit Terverifikasi
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {completed} / {total}
          </p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{
            width: `${total > 0 ? (completed / total) * 100 : 0}%`,
          }}
        />
      </div>

      <UniversalScanner
        label="Scanner Persediaan"
        placeholder="Masukkan IMEI atau Serial Number"
        onScan={handleScan}
        disabled={saving}
      />

      {message && (
        <div
          role="status"
          className={`rounded-lg p-3 text-sm ${
            success
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-800">
          Riwayat Scan Terbaru
        </h4>

        {scanLog.length === 0 ? (
          <p className="text-sm text-slate-400">
            Belum ada unit yang dipindai.
          </p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {scanLog.map((entry, index) => (
              <li
                key={`${entry}-${index}`}
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                {entry}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
