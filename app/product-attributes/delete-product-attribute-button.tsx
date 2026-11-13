
"use client";

import { useTransition } from "react";
import { deleteProductAttribute } from "./actions";

type Props = {
  id: string;
  attributeCode: string;
  attributeName: string;
};

export default function DeleteProductAttributeButton({
  id,
  attributeCode,
  attributeName,
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus Product Attribute berikut?\n\n${attributeName} (${attributeCode})\n\nSistem akan memeriksa seluruh relasi sebelum menghapus. Data yang masih digunakan tidak akan dihapus.`
    );

    if (!confirmed) return;

    const formData = new FormData();
    formData.set("id", id);

    startTransition(async () => {
      await deleteProductAttribute(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Menghapus..." : "Hapus"}
    </button>
  );
}
