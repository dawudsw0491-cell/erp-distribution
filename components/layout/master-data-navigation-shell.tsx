"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";

const MASTER_DATA_PATHS = ["/products", "/customers", "/suppliers", "/warehouses"];

function isMasterDataPath(path: string) {
  return MASTER_DATA_PATHS.some((base) => path === base || path.startsWith(`${base}/`));
}

export default function MasterDataNavigationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMasterData = isMasterDataPath(pathname || "");

  if (!isMasterData) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-slate-100">
      <ErpSidebar persistent />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
