"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Presentation-only enhancement for existing return links.
 * Keeps hrefs, navigation and server workflows unchanged.
 */
export default function BackLinkStyler() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      document.querySelectorAll("main a[href]").forEach((node) => {
        const anchor = node as HTMLAnchorElement;
        if (anchor.dataset.hexaBackStyled === "true") return;
        const label = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!/^(?:←\s*)?Kembali\b/i.test(label)) return;

        anchor.dataset.hexaBackStyled = "true";
        anchor.setAttribute("aria-label", label);
        anchor.textContent = "Back";
        anchor.classList.add("hexa-back-glass");
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
