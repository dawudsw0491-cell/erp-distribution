
"use client";

import { useState, useTransition } from "react";
import { deleteProductAttributeValue } from "./actions";

type Props = {
  id: string;
  valueName: string;
  valueCode: string;
};

export default function DeleteAttributeValueButton({
  id,
  valueName,
  valueCode,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus Attribute Value berikut?\n\n${valueName} (${valueCode})\n\nData akan dihapus permanen dan tidak dapat dikembalikan.`
    );

    if (!confirmed) return;

    setError("");

    const formData = new FormData();
    formData.set("id", id);

    startTransition(async () => {
      try {
        await deleteProductAttributeValue(formData);
      } catch (err) {
        // Next.js redirect menggunakan mekanisme internal throw.
        // Jangan menelan redirect tersebut.
        throw err;
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Menghapus..." : "Hapus"}
      </button>

      {error && (
        <span className="max-w-48 text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
