"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createSupplierContactAction,
  deleteSupplierContactAction,
  getSupplierContactsAction,
  setPrimarySupplierContactAction,
  updateSupplierContactAction,
} from "../contact-actions";

type SupplierContact = {
  id: string;
  supplier_id: string;
  contact_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  supplierId: string;
};

type FormState = {
  contactName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
};

const emptyForm: FormState = {
  contactName: "",
  position: "",
  phone: "",
  email: "",
  isPrimary: false,
  notes: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const labelClass =
  "mb-1.5 block text-sm font-medium text-slate-700";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function ContactManager({ supplierId }: Props) {
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getSupplierContactsAction(supplierId);

      if (!result.success) {
        setError(result.message);
        setContacts([]);
        return;
      }

      setContacts(
        Array.isArray(result.data)
          ? (result.data as SupplierContact[])
          : []
      );
    } catch {
      setError("Terjadi kesalahan saat mengambil data kontak supplier.");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

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
      isPrimary: contacts.length === 0,
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEditForm(contact: SupplierContact) {
    setEditingId(contact.id);
    setForm({
      contactName: contact.contact_name,
      position: contact.position ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      isPrimary: contact.is_primary,
      notes: contact.notes ?? "",
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const input = {
        supplierId,
        contactName: form.contactName,
        position: form.position,
        phone: form.phone,
        email: form.email,
        isPrimary: form.isPrimary,
        notes: form.notes,
      };

      const result = editingId
        ? await updateSupplierContactAction(editingId, input)
        : await createSupplierContactAction(input);

      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);

      await loadContacts();
    } catch {
      setError("Terjadi kesalahan saat menyimpan data kontak supplier.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPrimary(contactId: string) {
    if (saving) return;

    const confirmed = window.confirm(
      "Tetapkan kontak ini sebagai kontak utama supplier?"
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await setPrimarySupplierContactAction(
        supplierId,
        contactId
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      await loadContacts();
    } catch {
      setError("Gagal menetapkan kontak utama.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contact: SupplierContact) {
    if (saving) return;

    const confirmed = window.confirm(
      `Hapus kontak "${contact.contact_name}" dari supplier ini?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await deleteSupplierContactAction(
        supplierId,
        contact.id
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      await loadContacts();
    } catch {
      setError("Gagal menghapus kontak supplier.");
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

      {/* Header utama: hanya satu tombol Tambah Kontak */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            Data Kontak Supplier
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            Kelola informasi PIC dan kontak komunikasi supplier.
          </p>

          <p className="mt-2 text-xs font-medium text-slate-500">
            {loading
              ? "Memuat jumlah kontak..."
              : `Total kontak: ${contacts.length}`}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          disabled={loading || saving}
          className={`${primaryButtonClass} shrink-0`}
        >
          <span className="text-base font-bold">+</span>
          <span>Tambah Kontak</span>
        </button>
      </div>

      {/* Form tambah atau edit */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 md:p-6"
        >
          <section className="space-y-4">
            <h4 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-800">
              {editingId ? "Edit Kontak Supplier" : "Tambah Kontak Supplier"}
            </h4>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Nama Kontak <span className="text-red-600">*</span>
                </label>

                <input
                  required
                  maxLength={150}
                  value={form.contactName}
                  onChange={(e) =>
                    updateField("contactName", e.target.value)
                  }
                  className={inputClass}
                  placeholder="Nama lengkap PIC"
                />
              </div>

              <div>
                <label className={labelClass}>Jabatan</label>

                <input
                  maxLength={150}
                  value={form.position}
                  onChange={(e) =>
                    updateField("position", e.target.value)
                  }
                  className={inputClass}
                  placeholder="Contoh: Sales Manager"
                />
              </div>

              <div>
                <label className={labelClass}>Nomor Telepon</label>

                <input
                  type="tel"
                  maxLength={50}
                  value={form.phone}
                  onChange={(e) =>
                    updateField("phone", e.target.value)
                  }
                  className={inputClass}
                  placeholder="Contoh: 081234567890"
                />
              </div>

              <div>
                <label className={labelClass}>Email</label>

                <input
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(e) =>
                    updateField("email", e.target.value)
                  }
                  className={inputClass}
                  placeholder="nama@perusahaan.com"
                />
              </div>
            </div>
          </section>

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
              Tetapkan sebagai kontak utama supplier
            </span>
          </label>

          <section className="space-y-2">
            <label className={labelClass}>Catatan</label>

            <textarea
              rows={3}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className={inputClass}
              placeholder="Catatan tambahan mengenai kontak (opsional)"
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
                  : "Simpan Kontak"}
            </button>
          </div>
        </form>
      )}

      {/* Daftar kontak dalam satu card */}
<div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
  {loading ? (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-slate-600">
        Memuat data kontak supplier...
      </p>
    </div>
  ) : contacts.length === 0 ? (
    <div className="px-5 py-6 text-center">
      <p className="text-sm text-slate-500">
        Belum ada data kontak supplier. Gunakan tombol Tambah Kontak
        untuk mendaftarkan PIC supplier.
      </p>
    </div>
  ) : (
    <>
      {/* Tampilan desktop */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-5 py-4">Nama Kontak</th>
              <th className="px-5 py-4">Jabatan</th>
              <th className="px-5 py-4">Telepon</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Aksi</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className="transition hover:bg-blue-50/50"
              >
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-800">
                    {contact.contact_name}
                  </p>
                  {contact.is_primary && (
                    <span className="mt-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Kontak Utama
                    </span>
                  )}
                </td>

                <td className="px-5 py-4 text-slate-700">
                  {contact.position || "-"}
                </td>

                <td className="px-5 py-4 text-slate-700">
                  {contact.phone || "-"}
                </td>

                <td className="px-5 py-4 text-slate-700">
                  {contact.email || "-"}
                </td>

                <td className="px-5 py-4">
                  <span
                    className={
                      contact.is_primary
                        ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                        : "inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                    }
                  >
                    {contact.is_primary ? "Utama" : "Kontak"}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openEditForm(contact)}
                      className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      Edit
                    </button>

                    {!contact.is_primary && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSetPrimary(contact.id)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Jadikan Utama
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDelete(contact)}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tampilan tablet dan mobile */}
      <div className="grid grid-cols-1 gap-3 p-4 lg:hidden">
        {contacts.map((contact) => (
          <article
            key={contact.id}
            className="rounded-lg border border-slate-200 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-slate-800">
                  {contact.contact_name}
                </h4>
                {contact.position && (
                  <p className="mt-1 text-xs text-slate-500">
                    {contact.position}
                  </p>
                )}
              </div>

              {contact.is_primary && (
  <span className="shrink-0 self-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
    Kontak Utama
  </span>
)}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Nomor Telepon
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {contact.phone || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Email
                </p>
                <p className="mt-1 break-all text-sm text-slate-800">
                  {contact.email || "-"}
                </p>
              </div>

              {contact.notes && (
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Catatan
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {contact.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => openEditForm(contact)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
              >
                Edit
              </button>

              {!contact.is_primary && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetPrimary(contact.id)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  Jadikan Utama
                </button>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => handleDelete(contact)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 disabled:opacity-50"
              >
                Hapus
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )}
</div>

      {saving && (
        <p className="text-right text-xs font-medium text-slate-500">
          Memproses perubahan kontak...
        </p>
      )}
    </div>
  );
}