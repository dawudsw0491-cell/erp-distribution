
"use client";

import { useState } from "react";
import { toggleProductVariantStatus } from "@/app/products/actions";

type Props = {
  productId: string;
  variantId: string;
  isActive: boolean;
};

export default function VariantStatusButton({
  productId,
  variantId,
  isActive,
}: Props) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirmation(true)}
        className={`rounded-lg px-4 py-2 text-sm font-medium ${
          isActive
            ? "border border-red-300 bg-white text-red-700 hover:bg-red-50"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {isActive ? "Nonaktifkan Variant" : "Aktifkan Variant"}
      </button>

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">
              Konfirmasi Perubahan Status
            </h2>

            <p className="mt-3 text-sm text-slate-600">
              {isActive
                ? "Apakah Anda yakin ingin menonaktifkan variant ini?"
                : "Apakah Anda yakin ingin mengaktifkan kembali variant ini?"}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>

              <form action={toggleProductVariantStatus}>
                <input
                  type="hidden"
                  name="product_id"
                  value={productId}
                />
                <input
                  type="hidden"
                  name="variant_id"
                  value={variantId}
                />

                <button
                  type="submit"
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                    isActive
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  Ya, Lanjutkan
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
