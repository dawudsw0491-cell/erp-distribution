"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Normalize shared Back links and breadcrumb separators across ERP modules. */
export default function BackLinkStyler() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      document.querySelectorAll("main a[href]").forEach((node) => {
        const anchor = node as HTMLAnchorElement;
        if (anchor.dataset.hexaBackStyled === "true") return;
        const label = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!/^(?:←\s*)?(?:Kembali(?:\s+ke)?\b.*|Daftar Returns|Daftar Stock Opname)$/i.test(label)) return;
        anchor.dataset.hexaBackStyled = "true";
        anchor.setAttribute("aria-label", label);
        anchor.textContent = "Back";
        anchor.classList.add("hexa-back-glass");
      });

      // Replace visual slash separators only; slash characters in labels,
      // ratios, identifiers and business data remain untouched.
      document.querySelectorAll("main span.text-slate-400").forEach((node) => {
        const separator = node as HTMLSpanElement;
        if (separator.dataset.hexaSeparatorStyled === "true") return;
        if ((separator.textContent ?? "").trim() !== "/") return;
        separator.dataset.hexaSeparatorStyled = "true";
        separator.textContent = "";
        separator.setAttribute("aria-hidden", "true");
        separator.classList.add("hexa-breadcrumb-divider");
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
