
"use client";

import { toggleProductStatus } from "../actions";

type ProductStatusButtonProps = {
  productId: string;
  isActive: boolean;
};

export default function ProductStatusButton({
  productId,
  isActive,
}: ProductStatusButtonProps) {
  const actionLabel = isActive ? "menonaktifkan" : "mengaktifkan";

  return (
    <form
      action={toggleProductStatus}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Apakah Anda yakin ingin ${actionLabel} produk ini?`
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={productId} />

      <button
        type="submit"
        className={`rounded-lg px-4 py-2 text-sm font-medium ${
          isActive
            ? "border border-red-300 bg-white text-red-700 hover:bg-red-50"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {isActive ? "Nonaktifkan Produk" : "Aktifkan Produk"}
      </button>
    </form>
  );
}
