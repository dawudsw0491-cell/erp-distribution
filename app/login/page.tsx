
import type { Metadata } from "next";
import Image from "next/image";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login | HEXA CORE",
  description: "Login ke DSW Dynamic System Workflow",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_#ffffff_0%,_#eef6ff_42%,_#e8edf5_100%)] px-4 py-10 [font-family:var(--font-roboto),Arial,sans-serif]">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sky-300/25 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-44 -right-32 h-[30rem] w-[30rem] rounded-full bg-blue-300/20 blur-[100px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />

      <section className="relative z-10 w-full max-w-[430px]">
        <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_28px_80px_rgba(31,58,99,0.16),0_8px_24px_rgba(31,58,99,0.07),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl sm:p-8">
          <div className="relative mb-7 flex flex-col items-center text-center">
            <div className="pointer-events-none absolute left-1/2 top-[42%] h-56 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(147,197,253,0.30)_0%,rgba(191,219,254,0.16)_42%,rgba(239,246,255,0)_76%)] blur-2xl" />
            <Image
              src="/hexa-core-3d.svg"
              alt="Logo HEXA CORE 3D"
              width={240}
              height={258}
              priority
              unoptimized
              className="relative z-10 h-auto w-[170px] mix-blend-darken drop-shadow-[0_12px_16px_rgba(15,23,42,0.13)] sm:w-[190px]"
            />
            <h1 aria-label="HEXA CORE" className="mt-2 inline-flex items-center text-[2.65rem] font-black leading-none tracking-[0.035em] sm:text-[3rem]">
              <span className="text-slate-950 [text-shadow:0_2px_0_rgba(255,255,255,0.95),0_4px_5px_rgba(15,23,42,0.35)]">HEXA</span>
              <span className="ml-[0.035em] text-white [-webkit-text-stroke:1.4px_#2563eb] [paint-order:stroke_fill] [text-shadow:0_0_2px_#fff,0_0_5px_rgba(37,99,235,0.95),0_0_12px_rgba(37,99,235,0.85),0_0_23px_rgba(59,130,246,0.58),0_3px_6px_rgba(15,23,42,0.25)]">CORE</span>
            </h1>
          </div>

          <div className="mb-7 text-center">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600">Secure Workspace</p>
            <h1 className="text-[1.35rem] font-bold tracking-tight text-slate-900">Selamat Datang</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">Masuk untuk mengakses ruang kerja HEXA CORE.</p>
          </div>

          <LoginForm />

          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
            Secure enterprise access
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] font-medium tracking-wide text-slate-500">
          Enterprise Distribution Management System <span className="mx-1 text-slate-300">·</span> © 2026
        </p>
      </section>
    </main>
  );
}
