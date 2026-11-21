"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";
import MasterDataLoading from "@/components/layout/master-data-loading";

const MASTER_DATA_PATHS = ["/products", "/customers", "/suppliers", "/warehouses"];

function isMasterDataPath(path: string) {
  return MASTER_DATA_PATHS.some((base) => path === base || path.startsWith(`${base}/`));
}

export default function MasterDataNavigationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isMasterData = isMasterDataPath(pathname);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  function handleNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin === window.location.origin &&
      destination.pathname !== pathname &&
      isMasterDataPath(destination.pathname) &&
      isMasterDataPath(pathname)
    ) {
      setPendingPath(destination.pathname);
    }
  }

  useEffect(() => {
    if (!pendingPath) return;
    const arrived = pathname === pendingPath;
    const timeout = window.setTimeout(
      () => setPendingPath(null),
      arrived ? 220 : 12000
    );
    return () => window.clearTimeout(timeout);
  }, [pendingPath, pathname]);

  if (!isMasterData) return <>{children}</>;

  return (
    <div
      className="flex min-h-screen w-full bg-slate-100"
      onClickCapture={handleNavigation}
      aria-busy={pendingPath !== null}
    >
      <ErpSidebar persistent />
      <div className="relative min-w-0 flex-1">
        {children}
        {pendingPath && (
          <div className="fixed inset-y-0 left-64 right-0 z-[200] flex items-center justify-center bg-slate-100/80 backdrop-blur-[2px]">
            <div className="h-[70vh] w-full">
              <MasterDataLoading />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
