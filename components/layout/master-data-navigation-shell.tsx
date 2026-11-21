"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";

const MASTER_DATA_PATHS = ["/products", "/customers", "/suppliers", "/warehouses"];

function isMasterDataPath(path: string) {
  return MASTER_DATA_PATHS.some((base) => path === base || path.startsWith(`${base}/`));
}

export default function MasterDataNavigationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMasterData = isMasterDataPath(pathname || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  function handleNavigation(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin === window.location.origin &&
      destination.pathname !== pathname &&
      isMasterDataPath(destination.pathname) &&
      isMasterDataPath(pathname || "")
    ) {
      setLoading(true);
    }
  }

  if (!isMasterData) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-slate-100" onClick={handleNavigation}>
      <ErpSidebar persistent />
      <div className="min-w-0 flex-1">
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-150 ${loading ? "opacity-100" : "opacity-0"}`}
        >
          <div className="master-data-progress h-full bg-blue-600" />
        </div>
        {children}
      </div>
      <style jsx global>{`
        .master-data-progress {
          width: 0;
          transition: width 180ms ease-out;
        }
        .master-data-progress {
          animation: master-data-loading 1.8s ease-in-out infinite;
        }
        @keyframes master-data-loading {
          0% { width: 8%; transform: translateX(0); }
          55% { width: 68%; transform: translateX(0); }
          85% { width: 84%; transform: translateX(8%); }
          100% { width: 8%; transform: translateX(110vw); }
        }
      `}</style>
    </div>
  );
}
