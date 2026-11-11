
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import DashboardClock from "@/components/layout/dashboard-clock";

// DASHBOARD SUMMARY
const summaryCards = [
  {
    title: "Total Produk",
    value: "0",
    note: "Produk terdaftar",
    icon: "▦",
  },
  {
    title: "Total Persediaan",
    value: "0",
    note: "Unit tersedia",
    icon: "▣",
  },
  {
    title: "Penjualan Hari Ini",
    value: "Rp 0",
    note: "Belum ada transaksi",
    icon: "↗",
  },
  {
    title: "Total Piutang",
    value: "Rp 0",
    note: "Piutang pelanggan",
    icon: "◷",
  },
];

// DASHBOARD CONTENT
async function DashboardContent() {
  await connection();

  const {
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("dashboard.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/80 bg-gradient-to-br from-white via-sky-50 to-blue-100 p-8 text-center shadow-[0_15px_35px_rgba(37,99,235,0.16)]">
          <div className="mb-4 text-4xl text-red-500">!</div>

          <h1 className="text-xl font-bold text-slate-800">
            Akses Dashboard Ditolak
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Profil pengguna tidak aktif atau Anda tidak memiliki hak akses
            untuk membuka Dashboard. Silakan hubungi administrator sistem.
          </p>
        </div>
      </main>
    );
  }

  const displayName =
    profile.full_name?.trim() || user.email || "Pengguna";

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100 text-slate-800 md:flex">

      {/* SHARED ERP SIDEBAR */}
      <ErpSidebar activePath="/" />

      {/* MAIN CONTENT */}
      <main className="min-w-0 flex-1">

        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100/80 bg-gradient-to-r from-white via-white to-sky-50 px-5 py-4 shadow-[0_3px_12px_rgba(37,99,235,0.06)] md:px-8">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Ringkasan aktivitas bisnis distribusi handphone
            </p>
          </div>

          {/* JAM DIGITAL DAN INFORMASI PENGGUNA */}
<div className="flex flex-wrap items-center gap-4">
  <DashboardClock />

  <div className="flex items-center gap-3">
    <div className="text-right">
      <p className="text-sm font-semibold">
        {displayName}
      </p>

      <p className="text-xs text-slate-500">
        Pengguna ERP
      </p>
    </div>

    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-gradient-to-br from-white to-blue-100 font-bold text-blue-700 shadow-[0_3px_8px_rgba(37,99,235,0.16)]">
      {initial}
    </div>
  </div>
</div>
        </header>

        {/* DASHBOARD CONTENT */}
        <div className="space-y-6 p-5 md:p-8">

          {/* WELCOME */}
          <section className="rounded-2xl border border-white/80 bg-gradient-to-r from-white/90 via-sky-50 to-blue-100/70 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)]">
            <h2 className="text-lg font-bold text-slate-800">
              Selamat Datang di ERP Distribution
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Pantau operasional, persediaan, penjualan, dan keuangan bisnis Anda.
            </p>
          </section>

          {/* SUMMARY CARDS */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50 to-blue-100/80 p-5 shadow-[0_8px_20px_rgba(37,99,235,0.10),0_3px_7px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(37,99,235,0.17)]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">
                    {card.title}
                  </p>

                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-white to-blue-100 text-2xl text-blue-600 shadow-sm">
                    {card.icon}
                  </span>
                </div>

                <p className="mt-4 text-2xl font-bold text-slate-800">
                  {card.value}
                </p>

                <p className="mt-2 text-xs text-slate-400">
                  {card.note}
                </p>
              </div>
            ))}
          </section>

          {/* BUSINESS ACTIVITY AND SYSTEM INFORMATION */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

            {/* BUSINESS ACTIVITY */}
            <div className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50/70 to-blue-50 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)] xl:col-span-2">
              <h3 className="font-bold text-slate-800">
                Aktivitas Bisnis
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Ringkasan transaksi terbaru
              </p>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-blue-100 text-slate-500">
                      <th className="pb-3 pr-4 font-medium">
                        Tanggal
                      </th>

                      <th className="pb-3 pr-4 font-medium">
                        Aktivitas
                      </th>

                      <th className="pb-3 pr-4 font-medium">
                        Referensi
                      </th>

                      <th className="pb-3 font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td
                        colSpan={4}
                        className="py-10 text-center text-slate-400"
                      >
                        Belum ada transaksi. Data akan tampil setelah modul
                        operasional terhubung.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            
{/* SYSTEM HEALTH OVERVIEW */}
<div className="rounded-2xl border border-white/90 bg-gradient-to-br from-white via-sky-50/70 to-blue-50 p-6 shadow-[0_8px_22px_rgba(37,99,235,0.09)]">

  {/* HEADER */}
  <div className="flex items-center gap-3 border-b border-blue-100 pb-4">
    
<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 shadow-[0_6px_14px_rgba(5,150,105,0.18)]">
  <svg
    viewBox="0 0 64 64"
    className="h-12 w-12 drop-shadow-[0_5px_4px_rgba(5,100,70,0.3)]"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="System Health"
    role="img"
  >
    <defs>
      <linearGradient id="healthShield" x1="10" y1="5" x2="52" y2="60">
        <stop offset="0%" stopColor="#6EE7B7" />
        <stop offset="50%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="healthSide" x1="20" y1="20" x2="55" y2="60">
        <stop offset="0%" stopColor="#059669" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
    </defs>

    <path
      d="M32 5 L55 14 V30 C55 44 45 54 32 61 C19 54 9 44 9 30 V14 Z"
      fill="url(#healthSide)"
      transform="translate(0 2)"
    />

    <path
      d="M32 3 L54 12 V29 C54 42 44 52 32 58 C20 52 10 42 10 29 V12 Z"
      fill="url(#healthShield)"
      stroke="#D1FAE5"
      strokeWidth="1.5"
    />

    <path
      d="M16 15 L32 8 L48 15"
      stroke="white"
      strokeOpacity=".55"
      strokeWidth="2"
      strokeLinecap="round"
    />

    <path
      d="M20 30 L28 38 L44 22"
      stroke="white"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</div>


    <div>
      <h3 className="font-bold text-slate-800">
        STATUS SISTEM
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Monitoring Layanan DSW
      </p>
    </div>
  </div>

  {/* STATUS SERVER */}
  <div className="mt-5 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
        <span className="text-lg">▤</span>
      </div>
      <span className="text-sm font-medium text-slate-600">
        Status Server
      </span>
    </div>

    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
      Belum diperiksa
    </span>
  </div>

  {/* DATABASE */}
  <div className="mt-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
        <span className="text-lg">▥</span>
      </div>
      <span className="text-sm font-medium text-slate-600">
        Koneksi Database
      </span>
    </div>

    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
      Belum diperiksa
    </span>
  </div>

  {/* LAST BACKUP */}
  <div className="mt-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
        <span className="text-lg">◷</span>
      </div>
      <span className="text-sm font-medium text-slate-600">
        Backup Terakhir
      </span>
    </div>

    <span className="text-right text-xs font-medium text-slate-500">
      Belum tersedia
    </span>
  </div>

  {/* UPTIME */}
  <div className="mt-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
        <span className="text-lg">↗</span>
      </div>
      <span className="text-sm font-medium text-slate-600">
        Uptime Sistem
      </span>
    </div>

    <span className="text-xs font-semibold text-slate-500">
      Belum tersedia
    </span>
  </div>

  {/* SYSTEM CONDITION */}
  <div className="mt-5 rounded-xl border border-blue-100 bg-gradient-to-r from-sky-100/80 to-blue-100/80 p-4">
    <div className="flex items-center gap-2">
      <span className="text-lg text-blue-600">●</span>
      <span className="text-sm font-bold text-slate-700">
        Kondisi Sistem
      </span>
    </div>

    <p className="mt-1 pl-6 text-xs text-slate-500">
      Menunggu hasil pemeriksaan layanan sistem.
    </p>
  </div>

</div>

          </section>

          {/* FOOTER */}
          <footer className="pb-4 text-center text-xs font-medium text-slate-500 drop-shadow-[0_1px_1px_rgba(15,23,42,0.12)]">
            Enterprise Distribution & Workflow Gateway © 2026
          </footer>

        </div>
      </main>
    </div>
  );
}

// ROOT PAGE
export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-slate-100">
          <p className="text-sm text-slate-500">
            Memuat dashboard...
          </p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
