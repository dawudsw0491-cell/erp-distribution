
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Database,
  Package,
  Users,
  Truck,
  Warehouse,
  ShoppingCart,
  Boxes,
  ChevronDown,
  ClipboardList,
  ShoppingBag,
  RotateCcw,
  Wallet,
  Settings,
} from "lucide-react";

import LogoutButton from "@/components/layout/logout-button";

type ErpSidebarProps = {
  activePath?: string;
  persistent?: boolean;
};

type MenuChild = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

type MenuGroup = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: MenuChild[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: <LayoutDashboard size={18} />,
  },
  {
    label: "Master Data",
    href: "/master-data",
    icon: <Database size={18} />,
    children: [
      {
        label: "Master Product",
        href: "/products",
        icon: <Package size={16} />,
      },
      {
        label: "Pelanggan",
        href: "/customers",
        icon: <Users size={16} />,
      },
      {
        label: "Supplier",
        href: "/suppliers",
        icon: <Truck size={16} />,
      },
      {
        label: "Warehouse",
        href: "/warehouses",
        icon: <Warehouse size={16} />,
      },
    ],
  },
  {
    label: "Pembelian",
    href: "/purchases",
    icon: <ShoppingCart size={18} />,
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: <Boxes size={18} />,
    children: [
      {
        label: "Stock Balances",
        href: "/inventory/balances",
        icon: <Package size={16} />,
      },
      {
        label: "Stock Transfers",
        href: "/inventory/transfers",
        icon: <Truck size={16} />,
      },
      {
        label: "Stock Opname",
        href: "/inventory/opname",
        icon: <ClipboardList size={16} />,
      },
    ],
  },
  {
    label: "Penjualan",
    href: "/sales",
    icon: <ShoppingBag size={18} />,
  },
  {
    label: "Retur",
    href: "/returns",
    icon: <RotateCcw size={18} />,
  },
  {
    label: "Akuntansi & Laporan",
    href: "/accounting",
    icon: <Wallet size={18} />,
  },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: <Settings size={18} />,
  },
];

function isRouteActive(currentPath: string, href: string) {
  if (href === "/") {
    return currentPath === "/";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function ErpSidebar({
  activePath = "/",
  persistent = false,
}: ErpSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname || activePath;
  // Warm the App Router cache before the user clicks a destination.
  // This changes navigation timing only; server authorization and data
  // fetching still run normally when the destination is requested.
  function prefetchDestination(href: string) {
    if (href.startsWith("/") && !href.startsWith("/#")) {
      router.prefetch(href);
    }
  }

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!persistent) return null;

  function toggleGroup(label: string, currentlyExpanded: boolean) {
    setExpandedGroups((previous) => ({
      ...previous,
      [label]: !currentlyExpanded,
    }));
  }

  return (
    <aside className="erp-sidebar flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white/95">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-[0_7px_18px_rgba(76,105,220,0.28)]">
            <Boxes size={22} />
          </div>

          <div>
            <h1 aria-label="HEXA CORE" className="inline-flex items-center text-[17px] font-black leading-none tracking-[0.015em]">
              <span className="text-slate-950 [text-shadow:0_1px_0_rgba(255,255,255,0.95),0_2px_3px_rgba(15,23,42,0.28)]">HEXA</span>
              <span className="ml-[0.025em] text-white [-webkit-text-stroke:0.9px_#2563eb] [paint-order:stroke_fill] [text-shadow:0_0_1px_#fff,0_0_3px_rgba(37,99,235,0.95),0_0_7px_rgba(37,99,235,0.8),0_1px_3px_rgba(15,23,42,0.2)]">CORE</span>
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Enterprise ERP System
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Main Navigation
        </p>

        {menuGroups.map((group) => {
          const hasChildren = Boolean(group.children?.length);

          const groupActive = group.children
            ? group.children.some((child) =>
                isRouteActive(currentPath, child.href)
              )
            : group.href
              ? isRouteActive(currentPath, group.href)
              : false;

          const isExpanded = expandedGroups[group.label] ?? groupActive;

          if (hasChildren) {
            return (
              <div key={group.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label, isExpanded)}
                  aria-expanded={isExpanded}
                  className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${groupActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-indigo-700"}`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`erp-nav-icon  transition-colors duration-200 ${
                        groupActive
                          ? "text-indigo-600"
                          : "text-blue-500 group-hover:text-indigo-700"
                      }`}
                    >
                      {group.icon}
                    </span>
                    {group.label}
                  </span>

                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform duration-300 ease-in-out ${
                      isExpanded ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isExpanded
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="ml-5 space-y-1 border-l border-indigo-100 py-1 pl-3">
                      {group.children?.map((child) => {
                        const childActive = isRouteActive(
                          currentPath,
                          child.href
                        );

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            prefetch={true}
                            onMouseEnter={() => prefetchDestination(child.href)}
                            onFocus={() => prefetchDestination(child.href)}
                            onTouchStart={() => prefetchDestination(child.href)}
                            className={`group/child flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors duration-150 ${childActive ? "bg-blue-50 font-semibold text-blue-700" : "font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-700"}`}
                          >
                            {child.icon && (
                              <span
                                className="erp-nav-icon text-cyan-600  group-hover/child:text-indigo-700"
                              >
                                {child.icon}
                              </span>
                            )}

                            <span>{child.label}</span>

                            {childActive && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={group.label}
              href={group.href || "#"}
              prefetch={true}
              onMouseEnter={() => prefetchDestination(group.href || "/")}
              onFocus={() => prefetchDestination(group.href || "/")}
              onTouchStart={() => prefetchDestination(group.href || "/")}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                groupActive
                  ? "bg-blue-50 text-blue-700"
                  : "font-semibold text-slate-700 hover:bg-indigo-50/70 hover:text-indigo-800"
              }`}
            >
              <span
                className="erp-nav-icon text-blue-500  group-hover:text-violet-600"
              >
                {group.icon}
              </span>

              {group.label}

              {groupActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 rounded-xl border border-indigo-100/70 bg-gradient-to-br from-indigo-50/80 via-blue-50/70 to-cyan-50/80 p-3">
          <p className="text-xs font-semibold text-slate-700">
            HEXA Core ERP
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            Distribution Management System
          </p>
        </div>

        <LogoutButton />
      </div>
    </aside>
  );
}
