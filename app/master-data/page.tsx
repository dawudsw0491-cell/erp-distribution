
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const instant = false;

export const metadata = {
  title: "Master Data | HEXACORE ERP",
  description:
    "Pengelolaan master produk, pelanggan, supplier, dan warehouse.",
};

const masterDataItems = [
  {
    code: "MP",
    title: "Master Product",
    description:
      "Kelola data produk, model, varian, SKU, atribut, dan karakteristik barang dalam satu area kerja.",
    href: "/products",
    available: true,
  },
  {
  code: "PL",
  title: "Pelanggan",
  description:
    "Kelola identitas pelanggan, kontak, alamat, informasi komersial, dan hubungan bisnis.",
  href: "/customers",
  available: true,
},
  {
    code: "SP",
    title: "Supplier",
    description:
      "Kelola profil pemasok, kontak, alamat, rekening bank, dan informasi administrasi supplier.",
    href: "/suppliers",
    available: true,
  },
  {
    code: "WH",
    title: "Master Warehouse",
    description:
      "Kelola data gudang, kode warehouse, alamat, lokasi, kontak, dan status gudang perusahaan.",
    href: "/warehouses",
    available: true,
  },
];

export default async function MasterDataPage() {
  await connection();

  const { user, profile, authorized } =
    await getAuthorizationContext("master.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/master-data" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat Master Data.
              Silakan hubungi administrator sistem.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/master-data" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <header>
            <h1 className="text-2xl font-bold text-slate-900">
              Master Data
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Pusat pengelolaan data referensi produk, pelanggan,
              supplier, dan warehouse HEXACORE.
            </p>
          </header>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Area Kerja Master Data
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Empat submodul untuk mengelola data referensi
                utama perusahaan.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {masterDataItems.map((item) => {
                const cardContent = (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
                        {item.code}
                      </div>

                      <h3 className="font-semibold text-slate-900">
                        {item.title}
                      </h3>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>

                    <div className="mt-5 flex items-center justify-between">
                      <span
                        className={`text-sm font-medium ${
                          item.available
                            ? "text-blue-700"
                            : "text-slate-400"
                        }`}
                      >
                        {item.available
                          ? "Buka Area Kerja"
                          : "Belum Diimplementasikan"}
                      </span>

                      {item.available && (
                        <span className="text-blue-700 transition group-hover:translate-x-1">
                          →
                        </span>
                      )}
                    </div>
                  </>
                );

                return item.href ? (
                  <Link
                    key={item.code}
                    href={item.href}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <div
                    key={item.code}
                    aria-disabled="true"
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                  >
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
