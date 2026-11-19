
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveNewPin } from "./actions";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!/^\d{4}$/.test(pin)) {
      setErrorMessage("PIN harus tepat 4 digit angka.");
      return;
    }

    if (pin !== confirmPin) {
      setErrorMessage("Konfirmasi PIN tidak cocok.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await saveNewPin(pin);

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      setSuccessMessage(result.message);
      setPin("");
      setConfirmPin("");

      router.replace("/");
      router.refresh();
    } catch {
      setErrorMessage("Terjadi kesalahan koneksi. Silakan coba kembali.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          Buat PIN Baru
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Buat PIN angka 4 digit untuk akses HEXA Core.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="pin"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              PIN Baru
            </label>

            <input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="4 digit angka"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPin"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Konfirmasi PIN Baru
            </label>

            <input
              id="confirmPin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={confirmPin}
              onChange={(event) =>
                setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="Ulangi 4 digit PIN"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Menyimpan..." : "Simpan PIN"}
          </button>
        </form>
      </div>
    </main>
  );
}
