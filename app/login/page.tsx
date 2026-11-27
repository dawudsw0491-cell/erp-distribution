
import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login | HEXA CORE",
  description: "Login ke DSW Dynamic System Workflow",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100 px-4 py-10">

      {/* Decorative Background */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">

        {/* HEXACORE Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-[family-name:var(--font-lora)] text-4xl font-semibold tracking-[0.12em] text-slate-900">
            HEXA
            <span className="font-semibold text-blue-700">
              CORE
            </span>
          </h1>
        </div>

        {/* 3D Login Card */}
        <div className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50 to-blue-100 p-8 shadow-[0_15px_35px_rgba(37,99,235,0.16),0_5px_12px_rgba(15,23,42,0.08)] ring-1 ring-blue-200/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(37,99,235,0.22),0_8px_16px_rgba(15,23,42,0.10)]">

          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold tracking-wide text-slate-800">
              Selamat Datang Kembali
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Masuk untuk melanjutkan ke sistem HEXA CORE
            </p>
          </div>

          <LoginForm />

        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm font-extrabold italic text-slate-900 drop-shadow-[0_1px_1px_rgba(15,23,42,0.25)]">
          Enterprise Distribution Management System · © 2026
        </p>

      </div>
    </main>
  );
}
