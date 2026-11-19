
"use client";

import { useMemo, useState, useTransition } from "react";
import { recordStockOpnameCountsBulkAction } from "../actions";

type BulkItem = {
  id: string;
  product_id: string | null;
  inventory_status: string;
  snapshot_quantity: number;
  counted_quantity: number | null;
  variance_quantity: number | null;
  notes: string | null;
  product: {
    sku: string;
    product_name: string;
    unit: string;
  } | null;
};

type Props = {
  sessionId: string;
  items: BulkItem[];
  canEdit: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  damaged: "Damaged",
  repair: "Repair",
};

const PAGE_SIZE = 50;

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("id-ID", {
    maximumFractionDigits: 3,
  });
}

function normalizeStatus(value: string) {
  const normalized = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    available: "available",
    reserved: "reserved",
    damaged: "damaged",
    repair: "repair",
  };

  return aliases[normalized] ?? "";
}

function isValidQuantity(value: string) {
  if (!value.trim()) return false;

  const parsed = Number(value);

  return (
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    /^\d{1,15}(?:\.\d{1,3})?$/.test(value.trim())
  );
}

export default function BulkQuantityCountTable({
  sessionId,
  items,
  canEdit,
}: Props) {
  const initialValues = Object.fromEntries(
    items.map((item) => [
      item.id,
      item.counted_quantity === null
        ? ""
        : String(item.counted_quantity),
    ])
  );

  const initialNotes = Object.fromEntries(
    items.map((item) => [item.id, item.notes ?? ""])
  );

  const [values, setValues] = useState<Record<string, string>>(
    initialValues
  );

  const [notes, setNotes] = useState<Record<string, string>>(
    initialNotes
  );

  const [savedValues, setSavedValues] =
    useState<Record<string, string>>(initialValues);

  const [savedNotes, setSavedNotes] =
    useState<Record<string, string>>(initialNotes);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [countFilter, setCountFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [pasteText, setPasteText] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [isPending, startTransition] = useTransition();

  // Semua item snapshot Quantity harus dapat dihitung,
  // termasuk item yang snapshot_quantity = 0.
  const quantityItems = useMemo(
    () => items.filter((item) => item.product !== null),
    [items]
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return quantityItems.filter((item) => {
      const product = item.product;
      if (!product) return false;

      const matchesSearch =
        !keyword ||
        product.sku.toLowerCase().includes(keyword) ||
        product.product_name.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "all" ||
        item.inventory_status === statusFilter;

      const currentValue = values[item.id] ?? "";
      const hasCount = currentValue.trim() !== "";

      const counted = hasCount ? Number(currentValue) : null;
      const hasVariance =
        counted !== null &&
        Number.isFinite(counted) &&
        counted !== Number(item.snapshot_quantity);

      const matchesCount =
        countFilter === "all" ||
        (countFilter === "pending" && !hasCount) ||
        (countFilter === "counted" && hasCount) ||
        (countFilter === "variance" && hasVariance);

      return matchesSearch && matchesStatus && matchesCount;
    });
  }, [
    quantityItems,
    search,
    statusFilter,
    countFilter,
    values,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visibleItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const countedCount = quantityItems.filter(
    (item) => (values[item.id] ?? "").trim() !== ""
  ).length;

  const pendingCount = quantityItems.length - countedCount;

  const varianceCount = quantityItems.filter((item) => {
    const value = (values[item.id] ?? "").trim();

    if (!value || !isValidQuantity(value)) return false;

    return Number(value) !== Number(item.snapshot_quantity);
  }).length;

  const changedItems = quantityItems.filter((item) => {
    const currentValue = (values[item.id] ?? "").trim();
    const originalValue = (savedValues[item.id] ?? "").trim();

    const currentNote = notes[item.id] ?? "";
    const originalNote = savedNotes[item.id] ?? "";

    return (
      currentValue !== originalValue ||
      currentNote !== originalNote
    );
  });

  const invalidItems = changedItems.filter((item) =>
    !isValidQuantity(values[item.id] ?? "")
  );

  function updateValue(itemId: string, value: string) {
    setValues((current) => ({
      ...current,
      [itemId]: value,
    }));

    setMessage("");
    setErrorMessage("");
  }

  function updateNote(itemId: string, value: string) {
    setNotes((current) => ({
      ...current,
      [itemId]: value,
    }));

    setMessage("");
    setErrorMessage("");
  }

  function applyPaste() {
    setPasteMessage("");
    setMessage("");
    setErrorMessage("");

    if (!pasteText.trim()) {
      setPasteMessage("Belum ada data yang ditempel.");
      return;
    }

    const itemMap = new Map<string, BulkItem>();

    for (const item of quantityItems) {
      if (!item.product) continue;

      const key = `${item.product.sku.trim().toLowerCase()}|${item.inventory_status}`;

      itemMap.set(key, item);
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const updates: Record<string, string> = {};
    const noteUpdates: Record<string, string> = {};

    const seen = new Set<string>();
    const errors: string[] = [];

    let applied = 0;

    lines.forEach((line, index) => {
      const columns = line.includes("\t")
        ? line.split("\t")
        : line.split(";");

      if (
        index === 0 &&
        columns[0]?.trim().toLowerCase() === "sku"
      ) {
        return;
      }

      if (columns.length < 3) {
        errors.push(`Baris ${index + 1}: format tidak lengkap.`);
        return;
      }

      const sku = columns[0].trim();
      const status = normalizeStatus(columns[1]);
      const quantity = columns[2].trim();
      const note = columns.slice(3).join(" ").trim();

      if (!sku || !status) {
        errors.push(`Baris ${index + 1}: SKU atau status tidak valid.`);
        return;
      }

      if (!isValidQuantity(quantity)) {
        errors.push(`Baris ${index + 1}: quantity tidak valid.`);
        return;
      }

      const key = `${sku.toLowerCase()}|${status}`;

      if (seen.has(key)) {
        errors.push(`Baris ${index + 1}: SKU dan status duplikat.`);
        return;
      }

      seen.add(key);

      const item = itemMap.get(key);

      if (!item) {
        errors.push(
          `Baris ${index + 1}: ${sku} (${STATUS_LABELS[status]}) tidak ditemukan dalam snapshot.`
        );
        return;
      }

      updates[item.id] = quantity;

      if (note) {
        noteUpdates[item.id] = note;
      }

      applied += 1;
    });

    if (applied > 0) {
      setValues((current) => ({
        ...current,
        ...updates,
      }));

      setNotes((current) => ({
        ...current,
        ...noteUpdates,
      }));
    }

    if (errors.length > 0) {
      setPasteMessage(
        `${applied} baris diterapkan. ${errors.length} baris perlu diperiksa: ${errors.slice(0, 3).join(" ")}`
      );
    } else {
      setPasteMessage(`${applied} baris berhasil diterapkan.`);
    }
  }

  function saveAll() {
    setMessage("");
    setErrorMessage("");

    if (!canEdit) {
      setErrorMessage("Anda tidak memiliki izin mengubah hasil hitung.");
      return;
    }

    if (changedItems.length === 0) {
      setMessage("Tidak ada perubahan hasil hitung untuk disimpan.");
      return;
    }

    if (invalidItems.length > 0) {
      setErrorMessage(
        `${invalidItems.length} item memiliki quantity kosong atau tidak valid. Periksa kembali sebelum menyimpan.`
      );
      return;
    }

    const payload = changedItems.map((item) => ({
      item_id: item.id,
      counted_quantity: Number(values[item.id]),
      notes: notes[item.id] ?? "",
    }));

    startTransition(async () => {
      try {
        const result = await recordStockOpnameCountsBulkAction(
          sessionId,
          payload
        );

        if (!result.success) {
          setErrorMessage(
            result.message || "Gagal menyimpan hasil hitung massal."
          );
          return;
        }

        const nextSavedValues = { ...savedValues };
        const nextSavedNotes = { ...savedNotes };

        for (const entry of payload) {
          nextSavedValues[entry.item_id] = String(
            entry.counted_quantity
          );

          nextSavedNotes[entry.item_id] = entry.notes;
        }

        setSavedValues(nextSavedValues);
        setSavedNotes(nextSavedNotes);

        setMessage(
          `${result.updatedCount ?? payload.length} item berhasil disimpan.`
        );
      } catch {
        setErrorMessage(
          "Terjadi kesalahan saat menyimpan hasil hitung massal."
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Bulk Quantity Counting
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Hitung semua produk Quantity langsung dari tabel,
              termasuk item dengan saldo sistem nol.
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-500">
              Progres Penghitungan
            </p>

            <p className="text-xl font-bold text-slate-900">
              {formatNumber(countedCount)} / {formatNumber(quantityItems.length)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Sudah Dihitung</p>
            <p className="text-xl font-semibold text-slate-900">
              {formatNumber(countedCount)}
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Belum Dihitung</p>
            <p className="text-xl font-semibold text-amber-900">
              {formatNumber(pendingCount)}
            </p>
          </div>

          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-xs text-red-700">Ada Selisih</p>
            <p className="text-xl font-semibold text-red-900">
              {formatNumber(varianceCount)}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{
              width: `${
                quantityItems.length > 0
                  ? (countedCount / quantityItems.length) * 100
                  : 0
              }%`,
            }}
          />
        </div>

        {!canEdit && (
          <p className="mt-3 text-sm text-amber-700">
            Mode hanya lihat. Anda tidak memiliki izin untuk mengubah
            hasil penghitungan.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="font-semibold text-slate-900">
          Input Massal dari Excel
        </h4>

        <p className="mt-1 text-sm text-slate-500">
          Salin data Excel dengan urutan kolom: SKU, Status, Aktual,
          Catatan (opsional). Gunakan tab sebagai pemisah kolom.
        </p>

        <p className="mt-2 rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
          SKU [TAB] Status [TAB] Aktual [TAB] Catatan
        </p>

        <p className="mt-2 text-xs text-slate-500">
  Status yang digunakan: available, reserved, damaged, repair.
  SKU dan status harus sesuai dengan snapshot.
</p>

        <textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          disabled={!canEdit || isPending}
          rows={5}
          placeholder={
            "SKU001\tavailable\t10\tHasil hitung fisik\nSKU002\tavailable\t0\tTidak ditemukan"
          }
          className="mt-3 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={applyPaste}
            disabled={!canEdit || isPending || !pasteText.trim()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Terapkan Data Paste
          </button>

          <button
            type="button"
            onClick={() => {
              setPasteText("");
              setPasteMessage("");
            }}
            disabled={isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Bersihkan
          </button>
        </div>

        {pasteMessage && (
          <p className="mt-3 text-sm text-blue-700">
            {pasteMessage}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-900">
              Tabel Penghitungan Fisik
            </h4>

            <p className="mt-1 text-xs text-slate-500">
              {quantityItems.length} item snapshot Quantity, termasuk
              saldo nol.
            </p>
          </div>

          <button
            type="button"
            onClick={saveAll}
            disabled={
              !canEdit ||
              isPending ||
              changedItems.length === 0 ||
              invalidItems.length > 0
            }
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending
              ? "Menyimpan..."
              : `Simpan Perubahan (${changedItems.length})`}
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Cari SKU atau nama produk..."
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua Status</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={countFilter}
            onChange={(event) => {
              setCountFilter(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua Penghitungan</option>
            <option value="pending">Belum Dihitung</option>
            <option value="counted">Sudah Dihitung</option>
            <option value="variance">Ada Selisih</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[950px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-3">Produk</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Snapshot</th>
                <th className="px-3 py-3 text-right">Aktual</th>
                <th className="px-3 py-3 text-right">Selisih</th>
                <th className="px-3 py-3">Catatan</th>
                <th className="px-3 py-3">Kondisi</th>
              </tr>
            </thead>

            <tbody>
              {visibleItems.map((item) => {
                const product = item.product;
                if (!product) return null;

                const currentValue = values[item.id] ?? "";
                const hasCount = currentValue.trim() !== "";
                const valid = isValidQuantity(currentValue);

                const variance = valid
                  ? Number(currentValue) -
                    Number(item.snapshot_quantity)
                  : null;

                const changed = changedItems.some(
                  (changedItem) => changedItem.id === item.id
                );

                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">
                        {product.product_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {product.sku}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {STATUS_LABELS[item.inventory_status] ??
                          item.inventory_status}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right font-medium">
                      {formatNumber(item.snapshot_quantity)}{" "}
                      <span className="text-xs text-slate-500">
                        {product.unit?.trim().toUpperCase() || "-"}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={currentValue}
                        disabled={!canEdit || isPending}
                        onChange={(event) =>
                          updateValue(item.id, event.target.value)
                        }
                        placeholder="Belum dihitung"
                        className={`w-28 rounded-lg border px-3 py-2 text-right outline-none focus:border-blue-500 disabled:bg-slate-100 ${
                          hasCount && !valid
                            ? "border-red-400 bg-red-50"
                            : "border-slate-300"
                        }`}
                      />
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {variance === null ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={
                            variance < 0
                              ? "text-red-600"
                              : variance > 0
                                ? "text-green-700"
                                : "text-slate-600"
                          }
                        >
                          {variance > 0 ? "+" : ""}
                          {formatNumber(variance)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={notes[item.id] ?? ""}
                        disabled={!canEdit || isPending}
                        onChange={(event) =>
                          updateNote(item.id, event.target.value)
                        }
                        maxLength={2000}
                        placeholder="Catatan..."
                        className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </td>

                    <td className="px-3 py-3">
                      {!hasCount ? (
                        <span className="text-xs font-medium text-amber-700">
                          Belum dihitung
                        </span>
                      ) : !valid ? (
                        <span className="text-xs font-medium text-red-600">
                          Input tidak valid
                        </span>
                      ) : changed ? (
                        <span className="text-xs font-medium text-blue-700">
                          Belum disimpan
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-green-700">
                          Tersimpan
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visibleItems.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Tidak ada item yang sesuai dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Menampilkan {visibleItems.length} dari {filteredItems.length} item
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
            >
              Sebelumnya
            </button>

            <span className="text-sm text-slate-600">
              Halaman {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
