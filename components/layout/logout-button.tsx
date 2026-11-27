
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage("Logout gagal. Silakan coba kembali.");
        setIsLoading(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setErrorMessage("Terjadi kesalahan saat logout.");
      setIsLoading(false);
    }
  }

  return (
    <div className="pt-2">
      {errorMessage && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-red-200/80 bg-red-50/95 px-3 py-2 text-xs font-semibold text-red-800 shadow-[0_4px_14px_rgba(220,38,38,0.08)]"
        >
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoading}
        className="group flex w-full items-center gap-3 rounded-xl border border-red-200/80 bg-[linear-gradient(115deg,rgba(254,226,226,0.92),rgba(255,241,242,0.82))] px-4 py-3 text-left text-sm font-bold text-red-700 shadow-[0_8px_22px_rgba(220,38,38,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:shadow-[0_12px_26px_rgba(220,38,38,0.16)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogOut size={17} strokeWidth={2.5} className="text-red-600 drop-shadow-[0_0_5px_rgba(239,68,68,0.28)] transition-transform group-hover:translate-x-0.5" />

        {isLoading ? "Sedang Logout..." : "Logout"}
      </button>
    </div>
  );
}
