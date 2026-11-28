"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Apply shared Back, breadcrumb and page-title treatments across ERP routes. */
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

      document.querySelectorAll("main span.text-slate-400").forEach((node) => {
        const separator = node as HTMLSpanElement;
        if (separator.dataset.hexaSeparatorStyled === "true") return;
        if ((separator.textContent ?? "").trim() !== "/") return;
        separator.dataset.hexaSeparatorStyled = "true";
        separator.textContent = "";
        separator.setAttribute("aria-hidden", "true");
        separator.classList.add("hexa-breadcrumb-divider");
      });

      // Every real page title receives one consistent blue title accent.
      // Error-state headings (red/amber) are deliberately left unchanged.
      document.querySelectorAll("main h1").forEach((node) => {
        const heading = node as HTMLHeadingElement;
        if (heading.classList.contains("text-red-700") ||
            heading.classList.contains("text-amber-700") ||
            heading.classList.contains("text-red-600") ||
            heading.classList.contains("text-amber-600")) return;
        heading.classList.add("hexa-page-title");
        const previous = heading.previousElementSibling;
        if (previous?.classList.contains("hexa-breadcrumb-divider")) {
          previous.classList.add("hexa-breadcrumb-divider-hidden");
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
