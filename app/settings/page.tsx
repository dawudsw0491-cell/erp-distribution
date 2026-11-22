import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

type SettingItem = {
  title: string;
  description: string;
  href: string;
  permissionLabel: string;
};

function SettingCard({
  item,
}: {
  item: SettingItem;
}) {
  return (
    <Link
      href={item.href}
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 group-hover:text-blue-700">
            {item.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {item.description}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Akses: {item.permissionLabel}
          </p>
        </div>
        <span aria-hidden="true" className="text-lg text-slate-400 group-hover:text-blue-600">
          →
        </span>
      </div>
    </Link>
  );
}

export default async function SettingsPage() {
  await connection();

  const [
    usersAccess,
    roleAccess,
    masterAccess,
    auditAccess,
  ] = await Promise.all([
    getAuthorizationContext("users.manage"),
    getAuthorizationContext("roles.manage"),
    getAuthorizationContext("master.view"),
    getAuthorizationContext("audit.view"),
  ]);

  const user = usersAccess.user ?? roleAccess.user ?? masterAccess.user ?? auditAccess.user;
  const profile =
    usersAccess.profile ?? roleAccess.profile ?? masterAccess.profile ?? auditAccess.profile;

  if (!user) {
    redirect("/login");
  }

  const availableItems: SettingItem[] = [];

  if (usersAccess.authorized || roleAccess.authorized) {
    availableItems.push({
      title: "Pengguna dan Akses",
      description:
        "Kelola akun pengguna, penetapan role, status akun, dan proses administrasi pengguna yang sudah tersedia.",
      href: "/users",
      permissionLabel: usersAccess.authorized ? "users.manage" : "roles.manage",
    });
  }

  if (masterAccess.authorized) {
    availableItems.push({
      title: "Master Data",
      description:
        "Buka pengelolaan produk, varian, pelanggan, supplier, dan data referensi perusahaan.",
      href: "/master-data",
      permissionLabel: "master.view",
    });

    availableItems.push({
      title: "Gudang",
      description:
        "Kelola data gudang dan referensi lokasi operasional melalui modul Warehouse.",
      href: "/warehouses",
      permissionLabel: "master.view",
    });
  }

  if (auditAccess.authorized) {
    availableItems.push({
      title: "Audit dan Aktivitas",
      description:
        "Permission audit.view tersedia pada database. Halaman penelusuran audit terpusat belum tersedia.",
      href: "/settings",
      permissionLabel: "audit.view",
    });
  }

  if (!profile || availableItems.length === 0) {
    return (
      <div className="flex min-h-screen bg-slate-100">
        <ErpSidebar activePath="/settings" />
        <main className="flex flex-1 items-center justify-center p-6">
          <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Akses Pengaturan Ditolak</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Akun aktif tidak memiliki permission administrasi yang diperlukan untuk membuka Pengaturan.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:min-h-0 md:overflow-hidden">
      <ErpSidebar activePath="/settings" />
      <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-6xl space-y-7">
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Administration
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Pengaturan Sistem</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Pusat akses ke konfigurasi dan administrasi yang sudah tersedia. Setiap menu tetap menggunakan permission dan validasi pada modul sumbernya.
            </p>
          </header>

          <section>
            <div className="mb-4">
              <h2 className="font-semibold text-slate-900">Administrasi yang tersedia</h2>
              <p className="mt-1 text-sm text-slate-500">
                Menu ditampilkan berdasarkan permission akun yang sedang login.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {availableItems.map((item) => (
                <SettingCard key={item.href} item={item} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-900">Konfigurasi sistem lanjutan belum tersedia</h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Pengaturan profil perusahaan, penomoran dokumen, mata uang, pajak, periode akuntansi, dan preferensi operasional belum memiliki kontrak data serta halaman pengelolaan yang tervalidasi. Bagian ini tidak menyimpan konfigurasi sementara atau mengubah database.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
