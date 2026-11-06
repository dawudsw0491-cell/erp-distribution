
import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login | DAWUD ERP",
  description: "Login ke ERP Distribution Management System",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-wide text-slate-900">
            DAWUD<span className="text-blue-600">ERP</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Distribution Management System
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">
              Masuk ke Akun
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Masukkan email dan password untuk melanjutkan.
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          ERP Distribution & Mobile Phone Trading Management System © 2026
        </p>
      </div>
    </main>
  );
}
