
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function StockBalanceRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const refreshData = () => {
      if (!isMounted) return;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      // Menggabungkan event yang datang berdekatan
      // agar tidak melakukan refresh berulang.
      refreshTimeout = setTimeout(() => {
        if (isMounted) {
          router.refresh();
        }
      }, 300);
    };

    const channel = supabase
      .channel("stock-balance-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_balances",
        },
        refreshData
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_units",
        },
        refreshData
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Memastikan data terbaru setelah koneksi
          // pertama kali berhasil atau tersambung kembali.
          refreshData();
        }
      });

    return () => {
      isMounted = false;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
