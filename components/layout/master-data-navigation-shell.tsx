"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ErpSidebar from "@/components/layout/erp-sidebar";
import BackLinkStyler from "@/components/layout/back-link-styler";

const STANDALONE_PATHS = ["/login", "/change-password"];

function isStandalonePath(path: string) {
  return STANDALONE_PATHS.some(
    (base) => path === base || path.startsWith(`${base}/`)
  );
}

export default function MasterDataNavigationShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() || "";

  if (isStandalonePath(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-slate-100">
      <ErpSidebar persistent />
      <div className="relative min-w-0 flex-1"><BackLinkStyler />{children}</div>
    </div>
  );
}
