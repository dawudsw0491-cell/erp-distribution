
import Link from "next/link";
import LogoutButton from "./logout-button";

type ErpSidebarProps = {
  activePath: string;
};

const menuItems = [
  { code: "DB", label: "Dashboard", href: "/" },
  { code: "MD", label: "Master Data", href: "#" },
  { code: "SP", label: "Suppliers", href: "/suppliers" },
  { code: "PB", label: "Pembelian", href: "#" },
  { code: "PS", label: "Persediaan", href: "#" },
  { code: "PJ", label: "Penjualan", href: "#" },
  { code: "TG", label: "Transfer Gudang", href: "#" },
  { code: "RG", label: "Retur & Garansi", href: "#" },
  { code: "AK", label: "Akuntansi", href: "#" },
  { code: "LP", label: "Laporan", href: "#" },
];

export default function ErpSidebar({
  activePath,
}: ErpSidebarProps) {
  return (
    <aside className="flex w-full flex-col bg-slate-950 text-white md:min-h-screen md:w-64 md:shrink-0">
      <div className="border-b border-slate-800 px-6 py-6">
        <div className="text-xl font-bold tracking-wide">
          DAWUD<span className="text-blue-400">ERP</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Distribution Management System
        </p>
      </div>

      <nav
        aria-label="Navigasi utama ERP"
        className="flex-1 gap-2 overflow-x-auto p-4 md:block md:space-y-1"
      >
        {menuItems.map((item) => {
          const isActive = item.href === activePath;

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold">
                {item.code}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-slate-800 p-5 md:block">
        <p className="text-xs text-slate-400">Sistem ERP</p>
        <p className="mt-1 text-sm font-medium">Versi MVP 1.0</p>
        <p className="mt-1 text-xs text-slate-500">
          Development Environment
        </p>
      </div>

      <LogoutButton />
    </aside>
  );
}
