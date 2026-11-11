
import Link from "next/link";
import LogoutButton from "./logout-button";

type ErpSidebarProps = {
  activePath: string;
};

const menuItems = [
  { code: "DB", label: "Dashboard", href: "/" },
  { code: "MD", label: "Master Data", href: "/master-data" },
  { code: "PB", label: "Pembelian", href: null },
  { code: "PJ", label: "Penjualan", href: null },
  { code: "IV", label: "Inventory", href: null },
  { code: "RT", label: "Retur", href: null },
  { code: "AK", label: "Akuntansi & Laporan", href: null },
  { code: "PG", label: "Pengaturan", href: null },
];

export default function ErpSidebar({
  activePath,
}: ErpSidebarProps) {
  return (
    <aside className="relative z-40 flex w-full shrink-0 flex-col bg-slate-950 text-white md:sticky md:top-0 md:h-screen md:w-64">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-800 px-6 py-6">
        <div className="text-xl font-bold tracking-wide">
          HEXA<span className="text-blue-400">Core</span>
        </div>

        <p className="mt-1 text-xs text-slate-400">
          Dynamic System Workflow
        </p>
      </div>

      {/* Main Navigation */}
      <nav
        aria-label="Navigasi utama ERP"
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
      >
        {menuItems.map((item) => {
          const isActive =
            item.href !== null &&
            (activePath === item.href ||
              (item.href !== "/" &&
                activePath.startsWith(`${item.href}/`)));

          const className = `flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
            isActive
              ? "bg-blue-600 text-white"
              : item.href === null
                ? "cursor-not-allowed text-slate-500"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`;

          return (
            <div key={item.code}>
              {item.href !== null ? (
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={className}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold">
                    {item.code}
                  </span>

                  <span>{item.label}</span>
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  title="Modul belum tersedia"
                  className={className}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold">
                    {item.code}
                  </span>

                  <span>{item.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* System Information */}
      <div className="shrink-0 border-t border-slate-800 p-5">
        <p className="text-xs text-slate-400">
          Sistem ERP
        </p>

        <p className="mt-1 text-sm font-medium">
          Versi MVP 1.0
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Development Environment
        </p>
      </div>

      {/* Logout */}
      <div className="shrink-0">
        <LogoutButton />
      </div>
    </aside>
  );
}
