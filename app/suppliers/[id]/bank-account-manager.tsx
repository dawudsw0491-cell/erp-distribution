"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSupplierBankAccountAction,
  deleteSupplierBankAccountAction,
  getSupplierBankAccountsAction,
  setPrimarySupplierBankAccountAction,
  updateSupplierBankAccountAction,
} from "../bank-actions";

type BankAccount = {
  id: string;
  supplier_id: string;
  bank_name: string;
  bank_branch: string | null;
  account_name: string;
  account_number: string;
  currency_code: string;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  supplierId: string;
};

type FormState = {
  bankName: string;
  bankBranch: string;
  accountName: string;
  accountNumber: string;
  currencyCode: string;
  isPrimary: boolean;
  isActive: boolean;
  notes: string;
};

const emptyForm: FormState = {
  bankName: "",
  bankBranch: "",
  accountName: "",
  accountNumber: "",
  currencyCode: "IDR",
  isPrimary: false,
  isActive: true,
  notes: "",
};

// Disamakan dengan SupplierForm
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const labelClass =
  "mb-1.5 block text-sm font-medium text-slate-700";

// Disamakan dengan tombol utama SupplierForm
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function BankAccountManager({ supplierId }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getSupplierBankAccountsAction(supplierId);

      if (!result.success) {
        setError(result.message);
        setAccounts([]);
        return;
      }

      setAccounts((result.data ?? []) as BankAccount[]);
    } catch {
      setError("Terjadi kesalahan saat mengambil rekening bank.");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      isPrimary: accounts.length === 0,
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEditForm(account: BankAccount) {
    setEditingId(account.id);
    setForm({
      bankName: account.bank_name,
      bankBranch: account.bank_branch ?? "",
      accountName: account.account_name,
      accountNumber: account.account_number,
      currencyCode: account.currency_code,
      isPrimary: account.is_primary,
      isActive: account.is_active,
      notes: account.notes ?? "",
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (editingId) {
        const result = await updateSupplierBankAccountAction(editingId, {
          supplierId,
          bankName: form.bankName,
          bankBranch: form.bankBranch,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
          currencyCode: form.currencyCode,
          isActive: form.isActive,
          notes: form.notes,
        });

        if (!result.success) {
          setError(result.message);
          return;
        }

        if (
          form.isPrimary &&
          !accounts.find((account) => account.id === editingId)?.is_primary
        ) {
          const primaryResult =
            await setPrimarySupplierBankAccountAction(
              supplierId,
              editingId
            );

          if (!primaryResult.success) {
            setError(
              "Data rekening tersimpan, tetapi penetapan rekening utama gagal: " +
                primaryResult.message
            );
            await loadAccounts();
            return;
          }
        }

        setMessage(result.message);
      } else {
        const result = await createSupplierBankAccountAction({
          supplierId,
          bankName: form.bankName,
          bankBranch: form.bankBranch,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
          currencyCode: form.currencyCode,
          isPrimary: form.isPrimary,
          notes: form.notes,
        });

        if (!result.success) {
          setError(result.message);
          return;
        }

        setMessage(result.message);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadAccounts();
    } catch {
      setError("Terjadi kesalahan saat menyimpan rekening bank.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPrimary(accountId: string) {
    if (saving) return;

    const confirmed = window.confirm(
      "Tetapkan rekening ini sebagai rekening utama supplier?"
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await setPrimarySupplierBankAccountAction(
        supplierId,
        accountId
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      await loadAccounts();
    } catch {
      setError("Gagal menetapkan rekening utama.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(account: BankAccount) {
    if (saving) return;

    const confirmed = window.confirm(
      `Hapus rekening ${account.bank_name} - ${account.account_number}?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await deleteSupplierBankAccountAction(
        supplierId,
        account.id
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      await loadAccounts();
    } catch {
      setError("Gagal menghapus rekening bank.");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  return (
    <div className="space-y-5">
      {/* Notifikasi */}
      {message && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span className="text-lg">✓</span>
          <p>{message}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="text-lg">!</span>
          <p>{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            Data Rekening Bank
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Kelola rekening bank untuk transaksi pembayaran supplier.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">
            Total rekening: {accounts.length}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          disabled={loading || saving}
          className={`${primaryButtonClass} shrink-0`}
        >
          <span className="text-base font-bold text-white">+</span>
          <span>Tambah Rekening</span>
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 md:p-6"
        >
          <section className="space-y-4">
            <h2 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
              {editingId ? "Edit Rekening Bank" : "Tambah Rekening Bank"}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Nama Bank <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  maxLength={150}
                  value={form.bankName}
                  onChange={(e) => updateField("bankName", e.target.value)}
                  className={inputClass}
                  placeholder="Contoh: BCA"
                />
              </div>

              <div>
                <label className={labelClass}>Cabang Bank</label>
                <input
                  maxLength={150}
                  value={form.bankBranch}
                  onChange={(e) => updateField("bankBranch", e.target.value)}
                  className={inputClass}
                  placeholder="Nama cabang"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Nama Pemilik Rekening <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  maxLength={150}
                  value={form.accountName}
                  onChange={(e) => updateField("accountName", e.target.value)}
                  className={inputClass}
                  placeholder="Nama sesuai buku rekening"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Nomor Rekening <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  maxLength={100}
                  value={form.accountNumber}
                  onChange={(e) =>
                    updateField("accountNumber", e.target.value)
                  }
                  className={`${inputClass} font-mono tracking-wide`}
                  placeholder="Masukkan nomor rekening"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Mata Uang <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Z]{3}"
                  value={form.currencyCode}
                  onChange={(e) =>
                    updateField("currencyCode", e.target.value.toUpperCase())
                  }
                  className={inputClass}
                  placeholder="IDR"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Gunakan kode ISO mata uang, misalnya IDR, USD, atau SGD.
                </p>
              </div>

              {editingId && (
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <input
                    id="bank-active"
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      updateField("isActive", e.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="bank-active"
                    className="ml-3 text-sm font-medium text-slate-700"
                  >
                    Rekening aktif
                  </label>
                </div>
              )}
            </div>
          </section>

          {!editingId && (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) =>
                  updateField("isPrimary", e.target.checked)
                }
                className="h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Tetapkan sebagai rekening utama
              </span>
            </label>
          )}

          <section className="space-y-2">
            <label className={labelClass}>Catatan</label>
            <textarea
              rows={3}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className={inputClass}
              placeholder="Catatan tambahan (opsional)"
            />
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={closeForm}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Menyimpan..."
                : editingId
                  ? "Simpan Perubahan"
                  : "Simpan Rekening"}
            </button>
          </div>
        </form>
      )}

      ) : accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Belum ada rekening bank supplier.
        </p>

      {saving && (
        <p className="text-right text-xs font-medium text-slate-500">
          Memproses perubahan rekening...
        </p>
      )}
    </div>
  );
}