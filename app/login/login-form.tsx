
"use client";

import { useState, type FormEvent } from "react";
import { loginWithUserId } from "./actions";

export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!/^\d{4}$/.test(pin)) {
      setErrorMessage("PIN harus tepat 4 digit angka.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await loginWithUserId(identifier, pin);

      if (!result.success) {
        setErrorMessage(result.message || "Login gagal.");
        return;
      }

      // Full document navigation waits for the server action response and
      // its Set-Cookie headers before the protected route is requested.
      window.location.replace("/");
    } catch {
      setErrorMessage("Terjadi kesalahan koneksi. Silakan coba kembali.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label htmlFor="identifier" className="mb-2 block text-[13px] font-semibold tracking-wide text-slate-700">
          ID Pengguna
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="Masukkan ID pengguna"
          className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.035)] outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100/80"
        />
      </div>

      <div>
        <label htmlFor="pin" className="mb-2 block text-[13px] font-semibold tracking-wide text-slate-700">
          PIN Akses
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="current-password"
          required
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Masukkan PIN 4 digit"
          className="w-full rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-3.5 text-sm font-medium text-slate-800 shadow-[inset_0_1px_2px_rgba(30,64,175,0.035)] outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100/80"
        />
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-2xl bg-gradient-to-b from-indigo-500 to-blue-600 px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_8px_18px_rgba(37,99,235,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] transition duration-200 hover:-translate-y-0.5 hover:from-indigo-500 hover:to-blue-600 hover:shadow-[0_12px_24px_rgba(37,99,235,0.3)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Memverifikasi..." : "Masuk ke Sistem"}
      </button>
    </form>
  );
}
