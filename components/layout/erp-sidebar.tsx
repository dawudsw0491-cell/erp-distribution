
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Database,
  Package,
  Users,
  Truck,
  Warehouse,
  ShoppingCart,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  Smartphone,
  ChevronDown,
  ShoppingBag,
  RotateCcw,
  Wallet,
  Settings,
  Tags,
} from "lucide-react";

import LogoutButton from "@/components/layout/logout-button";

type ErpSidebarProps = {
  activePath?: string;
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
        label: "Kategori Produk",
        href: "/product-categories",
        icon: <Tags size={16} />,
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
      {
        label: "Product Models",
        href: "/product-models",
        icon: <Boxes size={16} />,
      },
      {
        label: "Product Attributes",
        href: "/product-attributes",
        icon: <Settings size={16} />,
      },
      {
        label: "Product Attribute Values",
        href: "/product-attribute-values",
        icon: <ClipboardList size={16} />,
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
        label: "Stock Movements",
        href: "/inventory/movements",
        icon: <ArrowLeftRight size={16} />,
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
      {
        label: "Serialized Units",
        href: "/inventory/units",
        icon: <Smartphone size={16} />,
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
}: ErpSidebarProps) {
  const pathname = usePathname();
  const currentPath = pathname || activePath;

  const [expandedGroups, setExpandedGroups] = useState<
    Record<string, boolean>
  >({
    "Master Data": false,
    Inventory: false,
  });

  useEffect(() => {
    setExpandedGroups((previous) => {
      const next = { ...previous };

      menuGroups.forEach((group) => {
        if (
          group.children?.some((child) =>
            isRouteActive(currentPath, child.href)
          )
        ) {
          next[group.label] = true;
        }
      });

      return next;
    });
  }, [currentPath]);

  function toggleGroup(label: string) {
    setExpandedGroups((previous) => ({
      ...previous,
      [label]: !previous[label],
    }));
  }

  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Boxes size={22} />
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              HEXA CORE
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
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

          const isExpanded = Boolean(expandedGroups[group.label]);

          if (hasChildren) {
            return (
              <div key={group.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isExpanded}
                  className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    groupActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`transition-colors duration-200 ${
                        groupActive
                          ? "text-blue-600"
                          : "text-slate-400 group-hover:text-slate-700"
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
                    <div className="ml-5 space-y-1 border-l border-slate-200 py-1 pl-3">
                      {group.children?.map((child) => {
                        const childActive = isRouteActive(
                          currentPath,
                          child.href
                        );

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`group/child flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-all duration-200 ease-in-out ${
                              childActive
                                ? "translate-x-1 bg-blue-50 font-semibold text-blue-700"
                                : "text-slate-500 hover:translate-x-1 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          >
                            {child.icon && (
                              <span
                                className={
                                  childActive
                                    ? "text-blue-600"
                                    : "text-slate-400 group-hover/child:text-slate-600"
                                }
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
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                groupActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span
                className={`transition-colors duration-200 ${
                  groupActive
                    ? "text-blue-600"
                    : "text-slate-400 group-hover:text-slate-700"
                }`}
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
        <div className="mb-3 rounded-lg bg-slate-50 p-3">
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
