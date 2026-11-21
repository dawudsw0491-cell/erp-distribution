"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ErpSidebar from "@/components/layout/erp-sidebar";

const MASTER_DATA_PATHS = ["/products", "/customers", "/suppliers", "/warehouses"];

function isMasterDataPath(path: string) {
  return MASTER_DATA_PATHS.some(
    (base) => path === base || path.startsWith(`${base}/`)
  );
}

export default function MasterDataNavigationShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() || "";

  if (!isMasterDataPath(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-slate-100">
      <ErpSidebar persistent />
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}
