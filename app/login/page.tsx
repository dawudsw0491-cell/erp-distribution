import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login | HEXA CORE",
  description: "Login ke DSW Dynamic System Workflow",
};

export default function LoginPage() {
  return (
    <main className="login-ambient relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 [font-family:var(--font-roboto),Arial,sans-serif]">
      <div aria-hidden="true" className="login-color-field pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="login-grain pointer-events-none absolute inset-0" />

      <section className="relative z-10 w-full max-w-[430px]">
        <div className="overflow-hidden rounded-[2rem] border border-white/55 bg-white/55 p-6 shadow-[0_28px_80px_rgba(31,41,55,0.15),0_8px_24px_rgba(31,41,55,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <h1 aria-label="HEXA CORE" className="inline-flex items-center text-[2.65rem] font-black leading-none tracking-[0.035em] sm:text-[3rem]">
              <span className="text-slate-950 [text-shadow:0_2px_0_rgba(255,255,255,0.95),0_4px_5px_rgba(15,23,42,0.35)]">HEXA</span>
              <span className="ml-[0.035em] text-white [-webkit-text-stroke:1.4px_#2563eb] [paint-order:stroke_fill] [text-shadow:0_0_2px_#fff,0_0_5px_rgba(37,99,235,0.95),0_0_12px_rgba(37,99,235,0.85),0_0_23px_rgba(59,130,246,0.58),0_3px_6px_rgba(15,23,42,0.25)]">CORE</span>
            </h1>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">Secure Workspace</p>
          </div>

          <p className="mb-6 text-center text-sm leading-relaxed text-slate-600">Masuk untuk mengakses ruang kerja HEXA CORE.</p>

          <LoginForm />

          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
            Secure enterprise access
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] font-medium tracking-wide text-slate-600">
          Enterprise Distribution Management System <span className="mx-1 text-slate-400">·</span> © 2026
        </p>
      </section>

    </main>
  );
}
