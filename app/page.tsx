
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

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

  // Memeriksa autentikasi, profil aktif, dan permission Dashboard.
  const {
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("dashboard.view");

  // Pengguna yang belum login diarahkan ke halaman login.
  if (!user) {
    redirect("/login");
  }

  // Menolak akses jika profil tidak aktif atau permission tidak tersedia.
  if (!profile || !authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
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

  // Menentukan identitas pengguna.
  const displayName =
    profile.full_name?.trim() || user.email || "Pengguna";

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 md:flex">

      {/* SHARED ERP SIDEBAR */}
      <ErpSidebar activePath="/" />

      {/* MAIN CONTENT */}
      <main className="min-w-0 flex-1">

        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Ringkasan aktivitas bisnis distribusi handphone
            </p>
          </div>

          {/* INFORMASI PENGGUNA */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">
                {displayName}
              </p>

              <p className="text-xs text-slate-500">
                Pengguna ERP
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              {initial}
            </div>
          </div>
        </header>

        {/* DASHBOARD CONTENT */}
        <div className="space-y-6 p-5 md:p-8">

          {/* WELCOME */}
          <section>
            <h2 className="text-lg font-bold">
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
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    {card.title}
                  </p>

                  <span className="text-2xl text-blue-600">
                    {card.icon}
                  </span>
                </div>

                <p className="mt-4 text-2xl font-bold">
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
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
              <h3 className="font-bold">
                Aktivitas Bisnis
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Ringkasan transaksi terbaru
              </p>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
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

            {/* SYSTEM INFORMATION */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold">
                Informasi Sistem
              </h3>

              <div className="mt-5 space-y-4 text-sm">

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    Nama Sistem
                  </span>

                  <span className="text-right font-medium">
                    ERP Distribution
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    Platform
                  </span>

                  <span className="font-medium">
                    Web Application
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    Database
                  </span>

                  <span className="font-medium">
                    Supabase
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    Versi
                  </span>

                  <span className="font-medium">
                    MVP 1.0
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <span className="font-medium text-emerald-600">
                    ● Development Environment
                  </span>
                </div>

              </div>
            </div>
          </section>

          {/* FOOTER */}
          <footer className="pb-4 text-center text-xs text-slate-400">
            ERP Distribution & Mobile Phone Trading Management System © 2026
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
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
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
